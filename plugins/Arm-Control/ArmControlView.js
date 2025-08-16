// src/plugins/Arm-Control/ArmControlView.js
// IMPORTANT: Ensure roslib.min.js is loaded BEFORE this script in index.html
// e.g., <script src="https://static.robotwebtools.org/roslibjs/current/roslib.min.js"></script>

(function () {
    class ArmControlView {
        constructor(element, openmct) {
            this.element = element;
            this.openmct = openmct;
            this.htmlContent = null;

            // Define joint values (in degrees)
            this.jointValues = {
                joint1: 0,
                joint2: 0,
                joint3: 0,
                joint4: 0,
                joint5: 0,
                joint6: 0
            };

            // Track the current mode, default is Forward Kinematics (FK)
            this.currentMode = 'FK';

            // Store references to UI elements
            this.joint1Slider = null;
            this.joint2Slider = null;
            this.joint3Slider = null;
            this.joint4Slider = null;
            this.joint5Slider = null;
            this.joint6Slider = null;
            this.modeSwitchButton = null;
            this.poseXDisplay = null;
            this.poseYDisplay = null;
            this.poseZDisplay = null;
            this.poseXPlusButton = null;
            this.poseXMinusButton = null;
            this.poseYPlusButton = null;
            this.poseYMinusButton = null;
            this.poseZPlusButton = null;
            this.poseZMinusButton = null;
            this.presetButton1 = null;
            this.presetButton2 = null;
            this.presetButton3 = null;
            this.cameraFeed1Img = null;
            this.cameraFeed2Img = null;
            this.joystickStatus = null;

            this.ros = null;
            this.rosConnected = false;

            // Declare ROS topics as properties to be initialized later
            this.jointCommandTopic = null;
            this.poseCommandTopic = null;
            this.currentPoseListener = null;
            this.camera1Topic = null;
            this.camera2Topic = null;

            // Throttle for camera feed updates to prevent flickering (target ~15 FPS)
            this.lastCamera1Update = 0;
            this.lastCamera2Update = 0;
            const THROTTLE_RATE_MS = 66; // 1000ms / 15fps = ~66ms per frame

            // Bind event handlers to the instance
            this.handleSliderInput = this.handleSliderInput.bind(this);
            this.handleRosConnection = this.handleRosConnection.bind(this);
            this.handleRosError = this.handleRosError.bind(this);
            this.handleRosClose = this.handleRosClose.bind(this);
            this.boundResizeHandler = this.createBoundResizeHandler();
            this.toggleMode = this.toggleMode.bind(this);
            this.publishPoseCommand = this.publishPoseCommand.bind(this);
            this.publishJointCommand = this.publishJointCommand.bind(this);
            this.handlePoseUpdate = this.handlePoseUpdate.bind(this);
            this.handleJointStateUpdate = this.handleJointStateUpdate.bind(this);

            // NEW: Bound function to handle camera topic messages with throttling
            this.handleCamera1Message = (message) => {
                const now = Date.now();
                if (now - this.lastCamera1Update < THROTTLE_RATE_MS) {
                    return; // Skip update if too soon
                }
                if (this.cameraFeed1Img && message.data) {
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
                    this.cameraFeed2Img.src = 'data:image/jpeg;base64,' + message.data;
                    this.lastCamera2Update = now;
                }
            };
        }

        createBoundResizeHandler() {
            return () => {};
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
            this.joint1VelSpan = this.element.querySelector('#joint1Vel');
            this.joint2VelSpan = this.element.querySelector('#joint2Vel');
            this.joint3VelSpan = this.element.querySelector('#joint3Vel');
            this.joint4VelSpan = this.element.querySelector('#joint4Vel');
            this.joint5VelSpan = this.element.querySelector('#joint5Vel');
            this.joint6VelSpan = this.element.querySelector('#joint6Vel');

            this.joint1Slider = this.element.querySelector('#joint1Slider');
            this.joint2Slider = this.element.querySelector('#joint2Slider');
            this.joint3Slider = this.element.querySelector('#joint3Slider');
            this.joint4Slider = this.element.querySelector('#joint4Slider');
            this.joint5Slider = this.element.querySelector('#joint5Slider');
            this.joint6Slider = this.element.querySelector('#joint6Slider');

            this.modeSwitchButton = this.element.querySelector('#modeSwitchButton');
            this.poseXDisplay = this.element.querySelector('#poseX');
            this.poseYDisplay = this.element.querySelector('#poseY');
            this.poseZDisplay = this.element.querySelector('#poseZ');
            this.poseXPlusButton = this.element.querySelector('#poseX-plus');
            this.poseXMinusButton = this.element.querySelector('#poseX-minus');
            this.poseYPlusButton = this.element.querySelector('#poseY-plus');
            this.poseYMinusButton = this.element.querySelector('#poseY-minus');
            this.poseZPlusButton = this.element.querySelector('#poseZ-plus');
            this.poseZMinusButton = this.element.querySelector('#poseZ-minus');
            this.presetButton1 = this.element.querySelector('#presetButton1');
            this.presetButton2 = this.element.querySelector('#presetButton2');
            this.presetButton3 = this.element.querySelector('#presetButton3');
            this.cameraFeed1Img = this.element.querySelector('#cameraFeed1');
            this.cameraFeed2Img = this.element.querySelector('#cameraFeed2');
            this.joystickStatus = this.element.querySelector('#joystickStatus');

            this.addEventListeners();
            this.addPresetButtonListeners();

            // Set initial UI state
            this.updateUIState();
            this.updateJointValueDisplays();
        }

        /**
         * Adds all event listeners for sliders and buttons.
         */
        addEventListeners() {
            const addSliderListener = (slider) => {
                if (slider) {
                    slider.addEventListener('input', this.handleSliderInput);
                }
            };

            addSliderListener(this.joint1Slider);
            addSliderListener(this.joint2Slider);
            addSliderListener(this.joint3Slider);
            addSliderListener(this.joint4Slider);
            addSliderListener(this.joint5Slider);
            addSliderListener(this.joint6Slider);

            window.addEventListener('resize', this.boundResizeHandler);

            // Add event listener for the new mode switch button
            if (this.modeSwitchButton) {
                this.modeSwitchButton.addEventListener('click', this.toggleMode);
            }

            // Add event listeners for pose control buttons
            if (this.poseXPlusButton) {
                this.poseXPlusButton.addEventListener('click', () => {
                    const currentX = parseFloat(this.poseXDisplay.textContent);
                    this.publishPoseCommand(currentX + 0.01, parseFloat(this.poseYDisplay.textContent), parseFloat(this.poseZDisplay.textContent));
                });
            }
            if (this.poseXMinusButton) {
                this.poseXMinusButton.addEventListener('click', () => {
                    const currentX = parseFloat(this.poseXDisplay.textContent);
                    this.publishPoseCommand(currentX - 0.01, parseFloat(this.poseYDisplay.textContent), parseFloat(this.poseZDisplay.textContent));
                });
            }
            if (this.poseYPlusButton) {
                this.poseYPlusButton.addEventListener('click', () => {
                    const currentY = parseFloat(this.poseYDisplay.textContent);
                    this.publishPoseCommand(parseFloat(this.poseXDisplay.textContent), currentY + 0.01, parseFloat(this.poseZDisplay.textContent));
                });
            }
            if (this.poseYMinusButton) {
                this.poseYMinusButton.addEventListener('click', () => {
                    const currentY = parseFloat(this.poseYDisplay.textContent);
                    this.publishPoseCommand(parseFloat(this.poseXDisplay.textContent), currentY - 0.01, parseFloat(this.poseZDisplay.textContent));
                });
            }
            if (this.poseZPlusButton) {
                this.poseZPlusButton.addEventListener('click', () => {
                    const currentZ = parseFloat(this.poseZDisplay.textContent);
                    this.publishPoseCommand(parseFloat(this.poseXDisplay.textContent), parseFloat(this.poseYDisplay.textContent), currentZ + 0.01);
                });
            }
            if (this.poseZMinusButton) {
                this.poseZMinusButton.addEventListener('click', () => {
                    const currentZ = parseFloat(this.poseZDisplay.textContent);
                    this.publishPoseCommand(parseFloat(this.poseXDisplay.textContent), parseFloat(this.poseYDisplay.textContent), currentZ - 0.01);
                });
            }
        }

        /**
         * Adds the event listeners for the preset buttons.
         */
        addPresetButtonListeners() {
            // Helper function to convert degrees to radians
            const toRadians = (degrees) => degrees * (Math.PI / 180);
            
            if (this.presetButton1) {
                this.presetButton1.addEventListener('click', () => this.publishJointCommand(
                    0,
                    54.97,
                    59.00,
                    3.00,
                    96.00,
                    0
                ));
                this.joint1Slider.value = 0.0.toFixed(2);
                this.joint2Slider.value = 54.97.toFixed(2);
                this.joint3Slider.value = 59.0.toFixed(2);
                this.joint4Slider.value = 3.0.toFixed(2);
                this.joint5Slider.value = 96.0.toFixed(2);
                this.joint6Slider.value = 0.0.toFixed(2);
                this.jointValues.joint1 = 0;
                this.jointValues.joint2 = 54.97;
                this.jointValues.joint3 = 59.0;
                this.jointValues.joint4 = 3.0;
                this.jointValues.joint5 = 96.0;
                this.jointValues.joint6 = 0.0;
                this.updateJointValueDisplays();
            
            }
            if (this.presetButton2) {
                this.presetButton2.addEventListener('click', () => this.publishJointCommand(
                    0.0,
                    0.0,
                    0.0,
                    0.0,
                    0.0,
                    0.0
                ));
                this.joint1Slider.value = 0.0.toFixed(2);
                this.joint2Slider.value = 0.0.toFixed(2);
                this.joint3Slider.value = 0.0.toFixed(2);
                this.joint4Slider.value = 0.0.toFixed(2);
                this.joint5Slider.value = 0.0.toFixed(2);
                this.joint6Slider.value = 0.0.toFixed(2);

                this.jointValues.joint1 = 0;
                this.jointValues.joint2 = 0;
                this.jointValues.joint3 = 0;
                this.jointValues.joint4 = 0;
                this.jointValues.joint5 = 0;
                this.jointValues.joint6 = 0;
                this.updateJointValueDisplays();
            }
            if (this.presetButton3) {
                this.presetButton3.addEventListener('click', () => this.publishJointCommand(
                    -156.33,
                    32.03,
                    57.65,
                    -3.85,
                    0,
                    0
                ));
                this.joint1Slider.value = -156.33.toFixed(2);
                this.joint2Slider.value = 32.03.toFixed(2);
                this.joint3Slider.value = 57.65.toFixed(2);
                this.joint4Slider.value = -3.85.toFixed(2);
                this.joint5Slider.value = 0.00.toFixed(2);
                this.joint6Slider.value = 0.00.toFixed(2);

                this.jointValues.joint1 = -156.33;
                this.jointValues.joint2 = 32.03;
                this.jointValues.joint3 = 57.65;
                this.jointValues.joint4 = -3.85;
                this.jointValues.joint5 = 0;
                this.jointValues.joint6 = 0;
                this.updateJointValueDisplays();
            }
        }

        /**
         * Handles slider input events. Publishes joint commands only in FK mode.
         * The message type is now PoseStamped, which requires a forward kinematics
         * calculation to get the end-effector position. This code provides
         * placeholder values for demonstration.
         */
        handleSliderInput(event) {
            if (this.currentMode === 'FK' && this.rosConnected) {
                // Get the updated joint values from the sliders
                const jointData = [
                    parseFloat(this.joint1Slider.value),
                    parseFloat(this.joint2Slider.value),
                    parseFloat(this.joint3Slider.value),
                    parseFloat(this.joint4Slider.value),
                    parseFloat(this.joint5Slider.value),
                    parseFloat(this.joint6Slider.value),
                ];

                // TODO: Implement forward kinematics to calculate x, y, z from jointData.
                // For now, we will publish a PoseStamped with placeholder values
                // to match the requested message type.
                const poseMessage = new ROSLIB.Message({
                    header: {
                        stamp: {
                            sec: Math.floor(Date.now() / 1000),
                            nanosec: (Date.now() % 1000) * 1e6
                        },
                        frame_id: 'base_link'
                    },
                    pose: {
                        position: {
                            // These values would be the result of your FK calculation
                            x: jointData[0],
                            y: jointData[1],
                            z: jointData[2]
                        },
                        orientation: {
                            // Placeholder for a default orientation (no rotation)
                            x: jointData[3],
                            y: jointData[4],
                            z: jointData[5],
                            w: 1
                        }
                    }
                });

                // Publish the joint commands
                this.jointCommandTopic.publish(poseMessage);

                // Update the displays directly as we are commanding the joints
                this.updateJointValueDisplays();
            }
        }

        /**
         * Toggles between FK and IK modes.
         */
        toggleMode() {
            this.currentMode = (this.currentMode === 'FK') ? 'IK' : 'FK';
            console.log(`Switched to ${this.currentMode} mode.`);
            this.updateUIState();
        }

        /**
         * Updates the UI elements and ROS topic subscriptions based on the current mode.
         */
        updateUIState() {
            const sliders = [this.joint1Slider, this.joint2Slider, this.joint3Slider, this.joint4Slider, this.joint5Slider, this.joint6Slider];
            const poseButtons = [this.poseXPlusButton, this.poseXMinusButton, this.poseYPlusButton, this.poseYMinusButton, this.poseZPlusButton, this.poseZMinusButton];
            const presetButtons = [this.presetButton1, this.presetButton2, this.presetButton3];
            
            if (this.currentMode === 'FK') {
                this.modeSwitchButton.textContent = 'Switch to IK Mode';

                // Enable sliders and preset buttons. Disable pose controls.
                sliders.forEach(slider => slider.disabled = false);
                presetButtons.forEach(button => button.disabled = false);
                poseButtons.forEach(button => button.disabled = true);
                
                // Subscribe to pose feedback and unsubscribe from joint feedback
                if (this.currentPoseListener) this.currentPoseListener.subscribe(this.handlePoseUpdate);
                if (this.jointCommandTopic) this.jointCommandTopic.unsubscribe();

            } else if (this.currentMode === 'IK') {
                this.modeSwitchButton.textContent = 'Switch to FK Mode';

                // Disable sliders and preset buttons. Enable pose controls.
                sliders.forEach(slider => slider.disabled = true);
                presetButtons.forEach(button => button.disabled = true);
                poseButtons.forEach(button => button.disabled = false);
                
                // Subscribe to joint feedback and unsubscribe from pose feedback
                if (this.jointCommandTopic) this.jointCommandTopic.subscribe(this.handleJointStateUpdate);
                if (this.currentPoseListener) this.currentPoseListener.unsubscribe();
            }
        }

        /**
         * Publishes a new pose command.
         */
        publishPoseCommand(x, y, z) {
            if (!this.rosConnected || !this.poseCommandTopic || this.currentMode !== 'IK') {
                return;
            }

            const poseMessage = new ROSLIB.Message({
                header: { stamp: { sec: Date.now() / 1000, nanosec: 0 } },
                pose: {
                    position: { x: x, y: y, z: z },
                    orientation: { x: 0, y: 0, z: 0, w: 1 }
                }
            });
            this.poseCommandTopic.publish(poseMessage);

            // Update the display immediately in IK mode
            if (this.poseXDisplay) this.poseXDisplay.textContent = x.toFixed(2);
            if (this.poseYDisplay) this.poseYDisplay.textContent = y.toFixed(2);
            if (this.poseZDisplay) this.poseZDisplay.textContent = z.toFixed(2);
        }

        /**
         * Publishes a new joint command with six joint values as a PoseStamped message.
         * The message contains placeholder values for position and orientation.
         */
        publishJointCommand(j1, j2, j3, j4, j5, j6) {
            if (!this.rosConnected || !this.jointCommandTopic) {
                return;
            }

            // The joint data is not directly used in the PoseStamped message,
            // but is logged for reference.
            console.log(`Publishing preset joint values: J1:${j1}, J2:${j2}, J3:${j3}, J4:${j4}, J5:${j5}, J6:${j6}`);

            // TODO: A real implementation would calculate the end-effector pose
            // from these joint values using forward kinematics.
            const poseMessage = new ROSLIB.Message({
                header: {
                    stamp: {
                        sec: Math.floor(Date.now() / 1000),
                        nanosec: (Date.now() % 1000) * 1e6
                    },
                    frame_id: 'base_link'
                },
                pose: {
                    position: {
                        x: j1,
                        y: j2,
                        z: j3
                    },
                    orientation: {
                        x: j4,
                        y: j5,
                        z: j6,
                        w: 0
                    }
                }
            });

            this.jointCommandTopic.publish(poseMessage);
        }

        /**
         * Handles incoming PoseStamped messages and updates the UI. (Used in FK mode).
         */
        handlePoseUpdate(message) {
            if (this.currentMode === 'FK') {
                if (this.poseXDisplay) this.poseXDisplay.textContent = message.pose.position.x.toFixed(2);
                if (this.poseYDisplay) this.poseYDisplay.textContent = message.pose.position.y.toFixed(2);
                if (this.poseZDisplay) this.poseZDisplay.textContent = message.pose.position.z.toFixed(2);
            }
        }

        /**
         * Handles incoming joint messages and updates the sliders and displays. (Used in IK mode).
         */
        handleJointStateUpdate(message) {
            if (this.currentMode === 'IK') {
                // const sliders = [
                //     this.joint1Slider, this.joint2Slider, this.joint3Slider,
                //     this.joint4Slider, this.joint5Slider, this.joint6Slider
                // ];

                // for (let i = 0; i < message.data.length && i < sliders.length; i++) {
                //     // Convert radians to degrees for the UI display/slider values
                //     const positionInDegrees = (message.data[i] * 180 / Math.PI).toFixed(1);

                //     if (sliders[i]) {
                //         sliders[i].value = positionInDegrees;
                //         this.jointValues[`joint${i+1}`] = parseFloat(positionInDegrees);
                //     }
                // }

                this.joint1Slider.value = message.pose.position.x.toFixed(1);
                this.joint2Slider.value = message.pose.position.y.toFixed(1);
                this.joint3Slider.value = message.pose.position.z.toFixed(1);
                this.joint4Slider.value = message.pose.orientation.x.toFixed(1);
                this.joint5Slider.value = message.pose.orientation.y.toFixed(1);
                this.joint6Slider.value = message.pose.orientation.z.toFixed(1);

                this.jointValues[`joint${1}`] = parseFloat(this.joint1Slider.value);
                this.jointValues[`joint${2}`] = parseFloat(this.joint2Slider.value);
                this.jointValues[`joint${3}`] = parseFloat(this.joint3Slider.value);
                this.jointValues[`joint${4}`] = parseFloat(this.joint4Slider.value);
                this.jointValues[`joint${5}`] = parseFloat(this.joint5Slider.value);
                this.jointValues[`joint${6}`] = parseFloat(this.joint6Slider.value);
                this.updateJointValueDisplays();
            }
        }

        /**
         * Updates the displayed joint velocity values.
         */
        updateJointValueDisplays() {
            const formatVal = (val) => val.toFixed(1);

            if (this.joint1VelSpan) this.joint1VelSpan.textContent = `J1: ${formatVal(this.jointValues.joint1)}`;
            if (this.joint2VelSpan) this.joint2VelSpan.textContent = `J2: ${formatVal(this.jointValues.joint2)}`;
            if (this.joint3VelSpan) this.joint3VelSpan.textContent = `J3: ${formatVal(this.jointValues.joint3)}`;
            if (this.joint4VelSpan) this.joint4VelSpan.textContent = `J4: ${formatVal(this.jointValues.joint4)}`;
            if (this.joint5VelSpan) this.joint5VelSpan.textContent = `J5: ${formatVal(this.jointValues.joint5)}`;
            if (this.joint6VelSpan) this.joint6VelSpan.textContent = `J6: ${formatVal(this.jointValues.joint6)}`;
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
        }

        /**
         * Initializes all ROS topics after a successful connection.
         */
        initializeTopics() {
            // Updated to publish a PoseStamped message on /robot/joint_command
            this.jointCommandTopic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/robot/joint_command',
                messageType: 'geometry_msgs/PoseStamped'
            });

            this.poseCommandTopic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/robot/desired_pose',
                messageType: 'geometry_msgs/PoseStamped'
            });

            this.currentPoseListener = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/robot/current_pose',
                messageType: 'geometry_msgs/PoseStamped'
            });

            this.camera1Topic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/camera/color/image_raw1/compressed',
                messageType: 'sensor_msgs/CompressedImage'
            });

            this.camera2Topic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/camera/color/image_raw2/compressed',
                messageType: 'sensor_msgs/CompressedImage'
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

            // Initialize all topics once after connection
            this.initializeTopics();

            // Set up initial subscriptions based on the default FK mode
            this.updateUIState();

            // Subscribe to camera topics
            this.camera1Topic.subscribe(this.handleCamera1Message);
            this.camera2Topic.subscribe(this.handleCamera2Message);
        }

        /**
         * Handles ROS connection errors.
         */
        handleRosError(error) {
            console.error('Error connecting to ROS websocket server: ', error);
            this.rosConnected = false;
            this.joystickStatus.textContent = 'ROS Connection Error!';
            this.joystickStatus.classList.remove('connected');
            this.joystickStatus.classList.add('error');
        }

        /**
         * Handles ROS connection closure.
         */
        handleRosClose() {
            console.log('Connection to ROS websocket server closed.');
            this.rosConnected = false;
            this.joystickStatus.textContent = 'Disconnected from ROS';
            this.joystickStatus.classList.remove('connected');
            this.joystickStatus.classList.add('error');

            // Unsubscribe from all topics on close
            if (this.currentPoseListener) { this.currentPoseListener.unsubscribe(); }
            if (this.jointCommandTopic) { this.jointCommandTopic.unsubscribe(); }
            if (this.poseCommandTopic) { this.poseCommandTopic.unsubscribe(); }
            if (this.camera1Topic) { this.camera1Topic.unsubscribe(); }
            if (this.camera2Topic) { this.camera2Topic.unsubscribe(); }

            // Reset all joint values to zero on disconnect
            this.jointValues = {
                joint1: 0, joint2: 0, joint3: 0, joint4: 0, joint5: 0, joint6: 0
            };
            this.updateJointValueDisplays();

            setTimeout(() => {
                console.log('Attempting to reconnect to ROS...');
                this.connectToROS();
            }, 3000);
        }

        /**
         * Cleans up resources when the view is destroyed.
         */
        destroy() {
            console.log('Destroying ArmControlView...');
            // Unsubscribe from all topics before destroying
            if (this.currentPoseListener) { this.currentPoseListener.unsubscribe(); }
            if (this.jointCommandTopic) { this.jointCommandTopic.unsubscribe(); }
            if (this.poseCommandTopic) { this.poseCommandTopic.unsubscribe(); }
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
            // Nullify all references for garbage collection
            this.element.innerHTML = '';
        }
    }

    // Expose ArmControlView globally
    window.ArmControlView = ArmControlView;

})();
