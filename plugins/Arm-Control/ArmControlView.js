// src/plugins/Arm-Control/ArmControlView.js

// IMPORTANT: Ensure roslib.min.js is loaded BEFORE this script in index.html
// e.g., <script src="https://static.robotwebtools.org/roslibjs/current/roslib.min.js"></script>

(function () {
    class ArmControlView {
        constructor(element, openmct) {
            this.element = element;
            this.openmct = openmct;
            this.htmlContent = null;

            // Define joint velocities, replacing joystick state
            this.jointVelocities = {
                joint1: 0,
                joint2: 0,
                joint3: 0,
                joint4: 0,
                joint5: 0,
                joint6: 0
            };

            // Store references to the slider elements
            this.joint1Slider = null;
            this.joint2Slider = null;
            this.joint3Slider = null;
            this.joint4Slider = null;
            this.joint5Slider = null;
            this.joint6Slider = null;
            
            // NEW: Store references to the camera feed elements
            this.cameraFeed1Img = null;
            this.cameraFeed2Img = null;

            this.ros = null;
            this.jointVelTopic = null;
            this.rosConnected = false;
            this.publishInterval = null;

            // NEW: ROS topics for camera feeds
            this.camera1Topic = null;
            this.camera2Topic = null;
            
            // NEW: Throttle for camera feed updates to prevent flickering (target ~15 FPS)
            this.lastCamera1Update = 0;
            this.lastCamera2Update = 0;
            // 1000ms / 15fps = ~66ms per frame
            const THROTTLE_RATE_MS = 66;

            // Bind event handlers
            this.updateJointVelocity = this.updateJointVelocity.bind(this);
            this.handleRosConnection = this.handleRosConnection.bind(this);
            this.handleRosError = this.handleRosError.bind(this);
            this.handleRosClose = this.handleRosClose.bind(this);
            this.publishJointVelocities = this.publishJointVelocities.bind(this);
            this.boundResizeHandler = this.createBoundResizeHandler();

            // NEW: Bound function to handle camera topic messages with throttling
            this.handleCamera1Message = (message) => {
                const now = Date.now();
                if (now - this.lastCamera1Update < THROTTLE_RATE_MS) {
                    return; // Skip update if too soon
                }
                if (this.cameraFeed1Img && message.data) {
                    // message.data from CompressedImage is already a Base64 string
                    this.cameraFeed1Img.src = 'data:image/jpeg;base64,' + message.data;
                    this.lastCamera1Update = now;
                }
            };
            this.handleCamera2Message = (message) => {
                const now = Date.now();
                if (now - this.lastCamera2Update < THROTTLE_RATE_MS) {
                    return; // Skip update if too soon
                }
                if (this.cameraFeed2Img && message.data) {
                    // message.data from CompressedImage is already a Base64 string
                    this.cameraFeed2Img.src = 'data:image/jpeg;base64,' + message.data;
                    this.lastCamera2Update = now;
                }
            };
        }

        /**
         * Creates a bound resize handler to ensure proper `this` context and allow removal.
         * @returns {function} A function bound to `this` to handle resize events.
         */
        createBoundResizeHandler() {
            // With sliders, there's no need to redraw or reset positions on resize.
            // The only action is to republish velocities.
            return () => {
                this.publishJointVelocities();
            };
        }

        /**
         * Renders the HTML template into the element.
         */
        render() {
            fetch('./plugins/Arm-Control/ArmControlView.html')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status} for ${response.url}`);
                    }
                    return response.text();
                })
                .then(html => {
                    this.htmlContent = html;
                    this.element.innerHTML = html;
                    this.initializeUI();
                    this.connectToROS();
                })
                .catch(error => {
                    console.error('Error loading ArmControlView.html:', error);
                    this.element.innerHTML = `<p style="color: red;">Error loading arm control UI. Check console for details. (Path: ./plugins/Arm-Control/ArmControlView.html)</p>`;
                });
        }

        /**
         * Initializes UI elements and sets up event listeners.
         */
        initializeUI() {
            // Get references to joint velocity display spans
            this.joint1VelSpan = this.element.querySelector('#joint1Vel');
            this.joint2VelSpan = this.element.querySelector('#joint2Vel');
            this.joint3VelSpan = this.element.querySelector('#joint3Vel');
            this.joint4VelSpan = this.element.querySelector('#joint4Vel');
            this.joint5VelSpan = this.element.querySelector('#joint5Vel');
            this.joint6VelSpan = this.element.querySelector('#joint6Vel');

            // Get references to the slider elements
            this.joint1Slider = this.element.querySelector('#joint1Slider');
            this.joint2Slider = this.element.querySelector('#joint2Slider');
            this.joint3Slider = this.element.querySelector('#joint3Slider');
            this.joint4Slider = this.element.querySelector('#joint4Slider');
            this.joint5Slider = this.element.querySelector('#joint5Slider');
            this.joint6Slider = this.element.querySelector('#joint6Slider');
            
            // NEW: Get references to camera feed elements
            this.cameraFeed1Img = this.element.querySelector('#cameraFeed1');
            this.cameraFeed2Img = this.element.querySelector('#cameraFeed2');

            // Get ROS status element
            this.joystickStatus = this.element.querySelector('#joystickStatus');

            // Add event listeners for each slider
            this.addEventListeners();
            this.updateJointVelocityDisplays();
            this.startContinuousPublishing();
        }

        /**
         * Adds all event listeners for slider interaction.
         */
        addEventListeners() {
            // Helper function to add input listener
            const addSliderListener = (slider, jointName) => {
                if (slider) {
                    slider.addEventListener('input', () => this.updateJointVelocity(slider, jointName));
                }
            };

            addSliderListener(this.joint1Slider, 'joint1');
            addSliderListener(this.joint2Slider, 'joint2');
            addSliderListener(this.joint3Slider, 'joint3');
            addSliderListener(this.joint4Slider, 'joint4');
            addSliderListener(this.joint5Slider, 'joint5');
            addSliderListener(this.joint6Slider, 'joint6');

            // Use the bound resize handler for window resize
            window.addEventListener('resize', this.boundResizeHandler);
        }

        /**
         * Removes all event listeners to prevent memory leaks.
         */
        removeEventListeners() {
            const removeSliderListener = (slider, jointName) => {
                if (slider) {
                    slider.removeEventListener('input', () => this.updateJointVelocity(slider, jointName));
                }
            };

            removeSliderListener(this.joint1Slider, 'joint1');
            removeSliderListener(this.joint2Slider, 'joint2');
            removeSliderListener(this.joint3Slider, 'joint3');
            removeSliderListener(this.joint4Slider, 'joint4');
            removeSliderListener(this.joint5Slider, 'joint5');
            removeSliderListener(this.joint6Slider, 'joint6');

            window.removeEventListener('resize', this.boundResizeHandler);
        }

        /**
         * Updates the joint velocity based on the slider value.
         * @param {HTMLInputElement} slider The slider element.
         * @param {string} jointName The name of the joint ('joint1', 'joint2', etc.).
         */
        updateJointVelocity(slider, jointName) {
            this.jointVelocities[jointName] = parseFloat(slider.value);
            this.updateJointVelocityDisplays();
        }

        /**
         * Updates the displayed joint velocity values.
         */
        updateJointVelocityDisplays() {
            const formatVel = (val) => val.toFixed(1);

            if (this.joint1VelSpan) this.joint1VelSpan.textContent = `J1: ${formatVel(this.jointVelocities.joint1)}`;
            if (this.joint2VelSpan) this.joint2VelSpan.textContent = `J2: ${formatVel(this.jointVelocities.joint2)}`;
            if (this.joint3VelSpan) this.joint3VelSpan.textContent = `J3: ${formatVel(this.jointVelocities.joint3)}`;
            if (this.joint4VelSpan) this.joint4VelSpan.textContent = `J4: ${formatVel(this.jointVelocities.joint4)}`;
            if (this.joint5VelSpan) this.joint5VelSpan.textContent = `J5: ${formatVel(this.jointVelocities.joint5)}`;
            if (this.joint6VelSpan) this.joint6VelSpan.textContent = `J6: ${formatVel(this.jointVelocities.joint6)}`;
        }

        /**
         * Establishes a connection to the ROS websocket server.
         */
        connectToROS() {
            if (typeof window.ROSLIB === 'undefined') {
                console.error("ROSLIB is not defined. Please ensure roslib.min.js is loaded in your index.html.");
                this.joystickStatus.textContent = 'ROSLIB not found!';
                this.joystickStatus.classList.add('error');
                return;
            }

            this.ros = new window.ROSLIB.Ros({
                url: 'ws://localhost:9090'
            });

            this.ros.on('connection', this.handleRosConnection);
            this.ros.on('error', this.handleRosError);
            this.ros.on('close', this.handleRosClose);

            // Define the ROS topic for publishing joint velocities
            this.jointVelTopic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/arm_joint_target_angles',
                messageType: 'std_msgs/Float64MultiArray'
            });
        }

        /**
         * Handles successful ROS connection.
         */
        handleRosConnection() {
            console.log('Connected to ROS websocket server.');
            this.rosConnected = true;
            this.joystickStatus.textContent = 'Connected to ROS';
            this.joystickStatus.classList.remove('error');
            this.joystickStatus.classList.add('connected');
            
            // NEW: Subscribe to camera topics after successful connection
            this.camera1Topic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/camera/color/image_raw1/compressed', // CORRECTED to compressed topic
                messageType: 'sensor_msgs/CompressedImage' // CORRECTED message type
            });

            this.camera2Topic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/camera/color/image_raw2/compressed', // CORRECTED to compressed topic
                messageType: 'sensor_msgs/CompressedImage' // CORRECTED message type
            });
            
            // Listen for image data and update the HTML img elements with throttling
            this.camera1Topic.subscribe(this.handleCamera1Message);
            this.camera2Topic.subscribe(this.handleCamera2Message);
        }

        /**
         * Handles ROS connection errors.
         * @param {Error} error The error object.
         */
        handleRosError(error) {
            console.error('Error connecting to ROS websocket server: ', error);
            this.rosConnected = false;
            this.joystickStatus.textContent = 'ROS Connection Error!';
            this.joystickStatus.classList.remove('connected');
            this.joystickStatus.classList.add('error');
        }

        /**
         * Handles ROS connection closure. Attempts to reconnect after a delay.
         */
        handleRosClose() {
            console.log('Connection to ROS websocket server closed.');
            this.rosConnected = false;
            this.joystickStatus.textContent = 'Disconnected from ROS';
            this.joystickStatus.classList.remove('connected');
            this.joystickStatus.classList.add('error');
            
            // NEW: Stop camera feeds on close
            if (this.camera1Topic) { this.camera1Topic.unsubscribe(); }
            if (this.camera2Topic) { this.camera2Topic.unsubscribe(); }

            // Reset all joint velocities to zero on disconnect
            this.jointVelocities = {
                joint1: 0, joint2: 0, joint3: 0, joint4: 0, joint5: 0, joint6: 0
            };
            this.updateJointVelocityDisplays();

            setTimeout(() => {
                console.log('Attempting to reconnect to ROS...');
                this.connectToROS();
            }, 3000);
        }

        /**
         * Starts a continuous interval for publishing joint velocities to ROS.
         * Publishes every 100ms.
         */
        startContinuousPublishing() {
            if (this.publishInterval) {
                clearInterval(this.publishInterval);
            }
            this.publishInterval = setInterval(() => {
                this.publishJointVelocities();
            }, 100);
        }

        /**
         * Publishes the current joint velocities to the ROS topic.
         */
        publishJointVelocities() {
            if (!this.rosConnected || !this.jointVelTopic) {
                return;
            }

            // Create a ROS Float64MultiArray message with all six current velocities
            const message = new window.ROSLIB.Message({
                data: [
                    this.jointVelocities.joint1,
                    this.jointVelocities.joint2,
                    this.jointVelocities.joint3,
                    this.jointVelocities.joint4,
                    this.jointVelocities.joint5,
                    this.jointVelocities.joint6
                ]
            });

            this.jointVelTopic.publish(message);
        }

        /**
         * Cleans up resources when the view is destroyed.
         */
        destroy() {
            console.log('Destroying ArmControlView...');
            this.removeEventListeners();

            if (this.publishInterval) {
                clearInterval(this.publishInterval);
                this.publishInterval = null;
            }

            if (this.rosConnected && this.jointVelTopic) {
                // Publish zero velocities one last time before destroying
                const message = new window.ROSLIB.Message({
                    data: [0, 0, 0, 0, 0, 0]
                });
                this.jointVelTopic.publish(message);
            }
            
            // NEW: Unsubscribe from camera topics before destroying
            if (this.camera1Topic) { this.camera1Topic.unsubscribe(); }
            if (this.camera2Topic) { this.camera2Topic.unsubscribe(); }

            if (this.ros) {
                this.ros.off('connection', this.handleRosConnection);
                this.ros.off('error', this.handleRosError);
                this.ros.off('close', this.handleRosClose);
                if (this.ros.isConnected) {
                    this.ros.close();
                }
            }

            this.joystickStatus = null;
            this.joint1VelSpan = null;
            this.joint2VelSpan = null;
            this.joint3VelSpan = null;
            this.joint4VelSpan = null;
            this.joint5VelSpan = null;
            this.joint6VelSpan = null;
            this.joint1Slider = null;
            this.joint2Slider = null;
            this.joint3Slider = null;
            this.joint4Slider = null;
            this.joint5Slider = null;
            this.joint6Slider = null;
            
            // NEW: Nullify camera feed references
            this.cameraFeed1Img = null;
            this.cameraFeed2Img = null;
            this.camera1Topic = null;
            this.camera2Topic = null;

            this.htmlContent = null;
            this.element.innerHTML = '';
        }
    }

    // Expose ArmControlView globally
    window.ArmControlView = ArmControlView;

})();
