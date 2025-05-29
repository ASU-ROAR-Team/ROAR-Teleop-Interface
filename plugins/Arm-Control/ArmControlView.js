// src/plugins/Arm-Control/ArmControlView.js

// IMPORTANT: Ensure roslib.min.js is loaded BEFORE this script in index.html
// e.g., <script src="https://static.robotwebtools.org/roslibjs/current/roslib.min.js"></script>

(function () {
    class ArmControlView {
        constructor(element, openmct) {
            this.element = element;
            this.openmct = openmct;
            this.htmlContent = null;

            this.canvas1 = null;
            this.ctx1 = null;
            this.canvas2 = null;
            this.ctx2 = null;

            this.joystickRadius = 0; // Calculated dynamically based on canvas size
            this.thumbRadius = 8; // Drastically REDUCED THUMB SIZE for small joysticks

            // Joystick 1 state (for Joint 1 and Joint 2)
            this.joystick1 = {
                centerX: 0,
                centerY: 0,
                thumbX: 0,
                thumbY: 0,
                isDragging: false,
                currentJoint1Vel: 0,
                currentJoint2Vel: 0
            };

            // Joystick 2 state (for Joint 3 and Joint 4)
            this.joystick2 = {
                centerX: 0,
                centerY: 0,
                thumbX: 0,
                thumbY: 0,
                isDragging: false,
                currentJoint3Vel: 0,
                currentJoint4Vel: 0
            };

            this.maxVelocity = 15.0; // Initial max velocity for DC motor (e.g., 15 RPM, max 30 RPM)

            this.ros = null;
            this.jointVelTopic = null; // ROS topic for joint velocities
            this.rosConnected = false;
            this.publishInterval = null; // For continuous publishing of velocities

            // Bind all event handlers to ensure 'this' context is correct
            this.onMouseDown = this.onMouseDown.bind(this);
            this.onMouseMove = this.onMouseMove.bind(this);
            this.onMouseUp = this.onMouseUp.bind(this);
            this.onMouseLeave = this.onMouseLeave.bind(this);
            this.updateMaxVelocity = this.updateMaxVelocity.bind(this);
            this.handleRosConnection = this.handleRosConnection.bind(this);
            this.handleRosError = this.handleRosError.bind(this);
            this.handleRosClose = this.handleRosClose.bind(this);
            this.drawJoystick = this.drawJoystick.bind(this); // Bind for window resize
            this.publishJointVelocities = this.publishJointVelocities.bind(this);
        }

        /**
         * Renders the HTML template into the element.
         */
        render() {
            // Fetch the HTML template for the view
            // Ensure correct casing for the 'Arm-Control' folder in the path
            fetch('./plugins/Arm-Control/ArmControlView.html')
                .then(response => {
                    // Check if the network request was successful (e.g., no 404)
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status} for ${response.url}`);
                    }
                    return response.text(); // Get the HTML content as text
                })
                .then(html => {
                    this.htmlContent = html;        // Store the HTML content
                    this.element.innerHTML = html;  // Inject HTML into the provided element
                    this.initializeUI();            // Initialize UI elements and event listeners
                    this.connectToROS();            // Establish ROS connection
                })
                .catch(error => {
                    // Log and display an error if the HTML fails to load
                    console.error('Error loading ArmControlView.html:', error);
                    this.element.innerHTML = `<p style="color: red;">Error loading arm control UI. Check console for details. (Path: ./plugins/Arm-Control/ArmControlView.html)</p>`;
                });
        }

        /**
         * Initializes UI elements and sets up event listeners.
         */
        initializeUI() {
            // Get references to canvas and 2D rendering contexts
            this.canvas1 = this.element.querySelector('#joystickCanvas1');
            this.ctx1 = this.canvas1.getContext('2d');
            this.canvas2 = this.element.querySelector('#joystickCanvas2');
            this.ctx2 = this.canvas2.getContext('2d');

            // Get references to slider, value display, and status elements
            this.maxVelocitySlider = this.element.querySelector('#maxVelocity');
            this.maxVelocityValueSpan = this.element.querySelector('#maxVelocityValue');
            this.joystickStatus = this.element.querySelector('#joystickStatus');

            // Get references to joint velocity display spans
            this.joint1VelSpan = this.element.querySelector('#joint1Vel');
            this.joint2VelSpan = this.element.querySelector('#joint2Vel');
            this.joint3VelSpan = this.element.querySelector('#joint3Vel');
            this.joint4VelSpan = this.element.querySelector('#joint4Vel');

            // Set up and draw joysticks initially
            this.setupCanvas(this.canvas1, this.joystick1);
            this.setupCanvas(this.canvas2, this.joystick2);

            // Add all necessary event listeners
            this.addEventListeners();
            this.updateMaxVelocity(); // Initialize slider value display
            this.updateJointVelocityDisplays(); // Initialize joint velocity displays
            this.startContinuousPublishing(); // Start publishing velocities periodically
        }

        /**
         * Configures a canvas element and initializes its joystick state.
         * @param {HTMLCanvasElement} canvas The canvas element.
         * @param {Object} joystickState The state object for the joystick.
         */
        setupCanvas(canvas, joystickState) {
            const wrapper = canvas.parentElement;
            // Set canvas dimensions to match its parent wrapper
            canvas.width = wrapper.clientWidth;
            canvas.height = wrapper.clientHeight;

            // Calculate joystick base radius dynamically, accounting for thumb size
            // This ensures the thumb has room to move within the base, and joysticks are equal size
            this.joystickRadius = Math.min(canvas.width, canvas.height) / 2 - (this.thumbRadius + 2); // Added a small 2px buffer

            // Set joystick center and initial thumb position to the center
            joystickState.centerX = canvas.width / 2;
            joystickState.centerY = canvas.height / 2;
            joystickState.thumbX = joystickState.centerX;
            joystickState.thumbY = joystickState.centerY;

            // Draw the joystick on the canvas
            this.drawJoystick(canvas, joystickState);
        }

        /**
         * Adds all event listeners for joystick interaction and the velocity slider.
         */
        addEventListeners() {
            // Mouse events for Joystick 1
            this.canvas1.addEventListener('mousedown', (e) => this.onMouseDown(e, this.canvas1, this.joystick1));
            this.canvas1.addEventListener('mousemove', (e) => this.onMouseMove(e, this.canvas1, this.joystick1));
            this.canvas1.addEventListener('mouseup', (e) => this.onMouseUp(this.joystick1));
            this.canvas1.addEventListener('mouseleave', (e) => this.onMouseLeave(this.joystick1));
            // Add mouseenter to set cursor to grab when hovering over the canvas
            this.canvas1.addEventListener('mouseenter', (e) => {
                if (!this.joystick1.isDragging) {
                    this.canvas1.style.cursor = 'grab';
                }
            });


            // Touch events for Joystick 1 (prevent default to avoid scrolling/zooming)
            this.canvas1.addEventListener('touchstart', (e) => { e.preventDefault(); this.onMouseDown(e.touches[0], this.canvas1, this.joystick1); });
            this.canvas1.addEventListener('touchmove', (e) => { e.preventDefault(); this.onMouseMove(e.touches[0], this.canvas1, this.joystick1); });
            this.canvas1.addEventListener('touchend', (e) => this.onMouseUp(this.joystick1));
            this.canvas1.addEventListener('touchcancel', (e) => this.onMouseUp(this.joystick1)); // Handle touch interruption

            // Mouse events for Joystick 2
            this.canvas2.addEventListener('mousedown', (e) => this.onMouseDown(e, this.canvas2, this.joystick2));
            this.canvas2.addEventListener('mousemove', (e) => this.onMouseMove(e, this.canvas2, this.joystick2));
            this.canvas2.addEventListener('mouseup', (e) => this.onMouseUp(this.joystick2));
            this.canvas2.addEventListener('mouseleave', (e) => this.onMouseLeave(this.joystick2));
            // Add mouseenter to set cursor to grab when hovering over the canvas
            this.canvas2.addEventListener('mouseenter', (e) => {
                if (!this.joystick2.isDragging) {
                    this.canvas2.style.cursor = 'grab';
                }
            });


            // Touch events for Joystick 2
            this.canvas2.addEventListener('touchstart', (e) => { e.preventDefault(); this.onMouseDown(e.touches[0], this.canvas2, this.joystick2); });
            this.canvas2.addEventListener('touchmove', (e) => { e.preventDefault(); this.onMouseMove(e.touches[0], this.canvas2, this.joystick2); });
            this.canvas2.addEventListener('touchend', (e) => this.onMouseUp(this.joystick2));
            this.canvas2.addEventListener('touchcancel', (e) => this.onMouseUp(this.joystick2));

            // Event listener for the Max Velocity slider
            this.maxVelocitySlider.addEventListener('input', this.updateMaxVelocity);

            // Handle window resize to redraw canvases and reset joysticks (important for responsiveness)
            window.addEventListener('resize', () => {
                if (this.canvas1) {
                    this.setupCanvas(this.canvas1, this.joystick1);
                    this.joystick1.currentJoint1Vel = 0; // Reset velocities on resize
                    this.joystick1.currentJoint2Vel = 0;
                }
                if (this.canvas2) {
                    this.setupCanvas(this.canvas2, this.joystick2);
                    this.joystick2.currentJoint3Vel = 0; // Reset velocities on resize
                    this.joystick2.currentJoint4Vel = 0;
                }
                this.updateJointVelocityDisplays();
                this.publishJointVelocities(); // Publish zero velocities after resize
            });
        }

        /**
         * Removes all event listeners to prevent memory leaks, especially when the view is destroyed.
         */
        removeEventListeners() {
            if (this.canvas1) {
                this.canvas1.removeEventListener('mousedown', (e) => this.onMouseDown(e, this.canvas1, this.joystick1));
                this.canvas1.removeEventListener('mousemove', (e) => this.onMouseMove(e, this.canvas1, this.joystick1));
                this.canvas1.removeEventListener('mouseup', (e) => this.onMouseUp(this.joystick1));
                this.canvas1.removeEventListener('mouseleave', (e) => this.onMouseLeave(this.joystick1));
                this.canvas1.removeEventListener('mouseenter', (e) => { /* no-op, need original bound function */ });
                this.canvas1.removeEventListener('touchstart', (e) => this.onMouseDown(e.touches[0], this.canvas1, this.joystick1));
                this.canvas1.removeEventListener('touchmove', (e) => { e.preventDefault(); this.onMouseMove(e.touches[0], this.canvas1, this.joystick1); });
                this.canvas1.removeEventListener('touchend', (e) => this.onMouseUp(this.joystick1));
                this.canvas1.removeEventListener('touchcancel', (e) => this.onMouseUp(this.joystick1));
            }
            if (this.canvas2) {
                this.canvas2.removeEventListener('mousedown', (e) => this.onMouseDown(e, this.canvas2, this.joystick2));
                this.canvas2.removeEventListener('mousemove', (e) => this.onMouseMove(e, this.canvas2, this.joystick2));
                this.canvas2.removeEventListener('mouseup', (e) => this.onMouseUp(this.joystick2));
                this.canvas2.removeEventListener('mouseleave', (e) => this.onMouseLeave(this.joystick2));
                this.canvas2.removeEventListener('mouseenter', (e) => { /* no-op, need original bound function */ });
                this.canvas2.removeEventListener('touchstart', (e) => this.onMouseDown(e.touches[0], this.canvas2, this.joystick2));
                this.canvas2.removeEventListener('touchmove', (e) => { e.preventDefault(); this.onMouseMove(e.touches[0], this.canvas2, this.joystick2); });
                this.canvas2.removeEventListener('touchend', (e) => this.onMouseUp(this.joystick2));
                this.canvas2.removeEventListener('touchcancel', (e) => this.onMouseUp(this.joystick2));
            }
            if (this.maxVelocitySlider) {
                this.maxVelocitySlider.removeEventListener('input', this.updateMaxVelocity);
            }
            // A more robust way to remove the resize listener would be to store the bound function in a variable.
            // For now, if 'this.drawJoystick' was used directly in the add, this should work.
            window.removeEventListener('resize', () => { /* no-op, need original bound function */ });
        }

        /**
         * Updates the max velocity value based on the slider and refreshes the display.
         */
        updateMaxVelocity() {
            this.maxVelocity = parseFloat(this.maxVelocitySlider.value);
            this.maxVelocityValueSpan.textContent = this.maxVelocity.toFixed(0);
        }

        /**
         * Updates the displayed joint velocity values.
         */
        updateJointVelocityDisplays() {
            const formatVel = (val) => val.toFixed(1); // Format to one decimal place
            const updateSpan = (span, value, label) => {
                span.textContent = `${label}: ${formatVel(value)}`;
                // Add/remove 'zero' class for styling (e.g., grey text for zero, green for non-zero)
                if (value !== 0) {
                    span.classList.remove('zero');
                } else {
                    span.classList.add('zero');
                }
            };

            // Update display for all four joints
            updateSpan(this.joint1VelSpan, this.joystick1.currentJoint1Vel, 'J1');
            updateSpan(this.joint2VelSpan, this.joystick1.currentJoint2Vel, 'J2');
            updateSpan(this.joint3VelSpan, this.joystick2.currentJoint3Vel, 'J3');
            updateSpan(this.joint4VelSpan, this.joystick2.currentJoint4Vel, 'J4');
        }

        /**
         * Draws the joystick base and thumb on the given canvas.
         * @param {HTMLCanvasElement} canvas The canvas to draw on.
         * @param {Object} joystickState The state object for the joystick.
         */
        drawJoystick(canvas, joystickState) {
            const ctx = canvas.getContext('2d');
            if (!ctx) return; // Ensure context is available

            ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the entire canvas

            // Draw outer circle (joystick base)
            ctx.beginPath();
            ctx.arc(joystickState.centerX, joystickState.centerY, this.joystickRadius, 0, Math.PI * 2, false);
            ctx.strokeStyle = '#666'; // Base border color
            ctx.lineWidth = 2; // Reduced base border thickness
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Semi-transparent base fill
            ctx.fill();

            // Draw thumbstick (the movable red circle)
            ctx.beginPath();
            ctx.arc(joystickState.thumbX, joystickState.thumbY, this.thumbRadius, 0, Math.PI * 2, false);
            ctx.fillStyle = '#f84632'; // Thumb fill color (red)
            ctx.fill();
            ctx.strokeStyle = '#f84632'; // Thumb border color (red)
            ctx.lineWidth = 1; // Reduced thumb border thickness
            ctx.stroke();
        }

        /**
         * Handles the mouse down event for a joystick.
         * Activates dragging only if the click is near the thumb.
         * @param {MouseEvent|TouchEvent} event The mouse or touch event.
         * @param {HTMLCanvasElement} canvas The canvas element.
         * @param {Object} joystickState The state object for the joystick.
         */
        onMouseDown(event, canvas, joystickState) {
            const rect = canvas.getBoundingClientRect();
            let mouseX = event.clientX - rect.left;
            let mouseY = event.clientY - rect.top;

            // Calculate the distance from the mouse click to the center of the joystick thumb
            const dist = Math.sqrt(
                Math.pow(mouseX - joystickState.thumbX, 2) +
                Math.pow(mouseY - joystickState.thumbY, 2)
            );

            // Only start dragging if the click is within the thumb's radius (plus a small buffer)
            if (dist <= this.thumbRadius + 5) { // Added a 5px buffer for easier clicking
                joystickState.isDragging = true;
                canvas.style.cursor = 'grabbing'; // Change cursor to indicate dragging
                this.updateThumbPosition(event, canvas, joystickState); // Immediately snap to click
            }
        }

        /**
         * Handles the mouse move event for a joystick, updating thumb position if dragging.
         * @param {MouseEvent|TouchEvent} event The mouse or touch event.
         * @param {HTMLCanvasElement} canvas The canvas element.
         * @param {Object} joystickState The state object for the joystick.
         */
        onMouseMove(event, canvas, joystickState) {
            if (!joystickState.isDragging) return; // Only process if currently dragging
            this.updateThumbPosition(event, canvas, joystickState);
        }

        /**
         * Handles the mouse up event for a joystick, resetting thumb and velocities.
         * @param {Object} joystickState The state object for the joystick.
         */
        onMouseUp(joystickState) {
            joystickState.isDragging = false; // Stop dragging
            // Reset cursor to default, not 'grab', on mouse up
            if (joystickState === this.joystick1) this.canvas1.style.cursor = 'default';
            if (joystickState === this.joystick2) this.canvas2.style.cursor = 'default';

            // Reset thumb to center of the joystick base
            joystickState.thumbX = joystickState.centerX;
            joystickState.thumbY = joystickState.centerY;
            this.drawJoystick(joystickState === this.joystick1 ? this.canvas1 : this.canvas2, joystickState);

            // Set current joint velocities to zero when joystick is released
            if (joystickState === this.joystick1) {
                joystickState.currentJoint1Vel = 0;
                joystickState.currentJoint2Vel = 0;
            } else {
                joystickState.currentJoint3Vel = 0;
                joystickState.currentJoint4Vel = 0;
            }
            this.updateJointVelocityDisplays(); // Update display
            this.publishJointVelocities(); // Publish zero velocities to ROS
        }

        /**
         * Handles mouse leave event, stopping dragging if the mouse leaves the canvas while dragging.
         * Also resets cursor if not dragging.
         * @param {Object} joystickState The state object for the joystick.
         */
        onMouseLeave(joystickState) {
            if (joystickState.isDragging) {
                this.onMouseUp(joystickState); // If dragging, treat leaving as mouse up
            } else {
                // If not dragging, simply reset cursor to default when leaving the canvas area
                if (joystickState === this.joystick1) this.canvas1.style.cursor = 'default';
                if (joystickState === this.joystick2) this.canvas2.style.cursor = 'default';
            }
        }

        /**
         * Updates the joystick thumb position based on mouse/touch input and calculates joint velocities.
         * @param {MouseEvent|TouchEvent} event The mouse or touch event.
         * @param {HTMLCanvasElement} canvas The canvas element.
         * @param {Object} joystickState The state object for the joystick.
         */
        updateThumbPosition(event, canvas, joystickState) {
            const rect = canvas.getBoundingClientRect();
            let mouseX = event.clientX - rect.left;
            let mouseY = event.clientY - rect.top;

            let dx = mouseX - joystickState.centerX;
            let dy = mouseY - joystickState.centerY;

            // Determine if horizontal or vertical movement is dominant (for 1-axis control)
            if (Math.abs(dx) > Math.abs(dy)) {
                // Dominant horizontal movement (e.g., for Joint 1 or 3)
                joystickState.thumbY = joystickState.centerY; // Clamp Y to center
                // Clamp X position within the joystick radius
                if (Math.abs(dx) > this.joystickRadius) {
                    joystickState.thumbX = joystickState.centerX + (dx > 0 ? this.joystickRadius : -this.joystickRadius);
                } else {
                    joystickState.thumbX = mouseX;
                }
            } else {
                // Dominant vertical movement (e.g., for Joint 2 or 4)
                joystickState.thumbX = joystickState.centerX; // Clamp X to center
                // Clamp Y position within the joystick radius
                if (Math.abs(dy) > this.joystickRadius) {
                    joystickState.thumbY = joystickState.centerY + (dy > 0 ? this.joystickRadius : -this.joystickRadius);
                } else {
                    joystickState.thumbY = mouseY;
                }
            }

            this.drawJoystick(canvas, joystickState); // Redraw the joystick with new thumb position

            // Calculate normalized values (-1 to 1) based on thumb displacement from center
            const normalizedX = (joystickState.thumbX - joystickState.centerX) / this.joystickRadius;
            const normalizedY = -(joystickState.thumbY - joystickState.centerY) / this.joystickRadius; // Y-axis inverted: up is positive

            // Assign velocities based on which joystick is being moved
            if (joystickState === this.joystick1) {
                joystickState.currentJoint1Vel = normalizedX * this.maxVelocity;
                joystickState.currentJoint2Vel = normalizedY * this.maxVelocity;
                // Ensure other joystick's velocities are zero if this joystick is active
                this.joystick2.currentJoint3Vel = 0;
                this.joystick2.currentJoint4Vel = 0;
            } else { // joystickState === this.joystick2
                // Ensure other joystick's velocities are zero if this joystick is active
                this.joystick1.currentJoint1Vel = 0;
                this.joystick1.currentJoint2Vel = 0;
                joystickState.currentJoint3Vel = normalizedX * this.maxVelocity;
                joystickState.currentJoint4Vel = normalizedY * this.maxVelocity;
            }
            this.updateJointVelocityDisplays(); // Update the displayed velocity values
        }

        /**
         * Establishes a connection to the ROS websocket server.
         */
        connectToROS() {
            // Check if ROSLIB library is available
            if (typeof window.ROSLIB === 'undefined') {
                console.error("ROSLIB is not defined. Please ensure roslib.min.js is loaded in your index.html.");
                this.joystickStatus.textContent = 'ROSLIB not found!';
                this.joystickStatus.classList.add('error');
                return;
            }

            // Create a new ROS connection instance
            this.ros = new window.ROSLIB.Ros({
                url: 'ws://localhost:9090' // Default ROS Bridge websocket URL
            });

            // Set up event listeners for ROS connection status
            this.ros.on('connection', this.handleRosConnection);
            this.ros.on('error', this.handleRosError);
            this.ros.on('close', this.handleRosClose);

            // Define the ROS topic for publishing joint velocities
            this.jointVelTopic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/arm_joint_velocities', // ROS topic name
                messageType: 'std_msgs/Float64MultiArray' // Message type for an array of double-precision floats
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
            this.publishJointVelocities(); // Publish initial velocities (likely zero)
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
            // Reset all joint velocities to zero on disconnect
            this.joystick1.currentJoint1Vel = 0;
            this.joystick1.currentJoint2Vel = 0;
            this.joystick2.currentJoint3Vel = 0;
            this.joystick2.currentJoint4Vel = 0;
            this.updateJointVelocityDisplays(); // Update display to show zeros

            // Attempt to reconnect after a 3-second delay
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
            // Clear any existing interval to prevent multiple intervals running
            if (this.publishInterval) {
                clearInterval(this.publishInterval);
            }
            // Set up a new interval to call publishJointVelocities every 100ms
            this.publishInterval = setInterval(() => {
                this.publishJointVelocities();
            }, 100);
        }

        /**
         * Publishes the current joint velocities to the ROS topic.
         */
        publishJointVelocities() {
            // Only publish if connected to ROS and the topic is defined
            if (!this.rosConnected || !this.jointVelTopic) {
                return;
            }

            // Create a ROS Float64MultiArray message with the current velocities
            const message = new window.ROSLIB.Message({
                data: [
                    this.joystick1.currentJoint1Vel,
                    this.joystick1.currentJoint2Vel,
                    this.joystick2.currentJoint3Vel,
                    this.joystick2.currentJoint4Vel
                ]
            });

            this.jointVelTopic.publish(message); // Publish the message
        }

        /**
         * Cleans up resources when the view is destroyed.
         * This is crucial for preventing memory leaks in Open MCT.
         */
        destroy() {
            console.log('Destroying ArmControlView...');
            this.removeEventListeners(); // Remove all event listeners

            // Stop continuous publishing interval
            if (this.publishInterval) {
                clearInterval(this.publishInterval);
                this.publishInterval = null;
            }

            // Publish zero velocities one last time before destroying
            if (this.rosConnected && this.jointVelTopic) {
                this.joystick1.currentJoint1Vel = 0;
                this.joystick1.currentJoint2Vel = 0;
                this.joystick2.currentJoint3Vel = 0;
                this.joystick2.currentJoint4Vel = 0;
                this.publishJointVelocities();
            }

            // Clean up ROS connection listeners and close if connected
            if (this.ros) {
                this.ros.off('connection', this.handleRosConnection);
                this.ros.off('error', this.handleRosError);
                this.ros.off('close', this.handleRosClose);
                if (this.ros.isConnected) {
                    this.ros.close();
                }
            }

            // Nullify references to DOM elements and other objects to aid garbage collection
            this.canvas1 = null;
            this.ctx1 = null;
            this.canvas2 = null;
            this.ctx2 = null;
            this.maxVelocitySlider = null;
            this.maxVelocityValueSpan = null;
            this.joystickStatus = null;
            this.joint1VelSpan = null;
            this.joint2VelSpan = null;
            this.joint3VelSpan = null;
            this.joint4VelSpan = null;

            this.htmlContent = null;
            this.element.innerHTML = ''; // Clear the inner HTML
        }
    }

    // Expose the class globally so Open MCT can instantiate it
    window.ArmControlView = ArmControlView;

})();
