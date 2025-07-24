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
            this.canvas3 = null; // NEW: Canvas for the third joystick
            this.ctx3 = null;    // NEW: Context for the third joystick

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

            // NEW: Joystick 3 state (for Joint 5 and Joint 6)
            this.joystick3 = {
                centerX: 0,
                centerY: 0,
                thumbX: 0,
                thumbY: 0,
                isDragging: false,
                currentJoint5Vel: 0, // Maps to J5
                currentJoint6Vel: 0  // Maps to J6
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
            this.drawJoystick = this.drawJoystick.bind(this); // Bind for window resize - NOTE: This isn't the direct resize handler itself
            this.publishJointVelocities = this.publishJointVelocities.bind(this);

            // Store references to bound event handlers for proper removal
            this.boundHandlers = {
                canvas1: {},
                canvas2: {},
                canvas3: {}
            };
            this.boundResizeHandler = this.createBoundResizeHandler();
        }

        /**
         * Creates a bound resize handler to ensure proper `this` context and allow removal.
         * It also correctly re-initializes canvas dimensions based on their fixed size.
         * @returns {function} A function bound to `this` to handle resize events.
         */
        createBoundResizeHandler() {
            return () => {
                // When resizing, we re-setup each canvas to ensure its internal drawing surface
                // is correctly sized (80x80px in this case) and reset thumb position.
                // We do NOT use wrapper.clientWidth/Height here, as the canvas itself is fixed size.
                if (this.canvas1) {
                    this.setupCanvas(this.canvas1, this.joystick1); // Re-runs setupCanvas, which sets width/height to 80
                    this.joystick1.currentJoint1Vel = 0;
                    this.joystick1.currentJoint2Vel = 0;
                }
                if (this.canvas2) {
                    this.setupCanvas(this.canvas2, this.joystick2);
                    this.joystick2.currentJoint3Vel = 0;
                    this.joystick2.currentJoint4Vel = 0;
                }
                if (this.canvas3) { // Handle resize for third joystick
                    this.setupCanvas(this.canvas3, this.joystick3);
                    this.joystick3.currentJoint5Vel = 0;
                    this.joystick3.currentJoint6Vel = 0;
                }
                this.updateJointVelocityDisplays();
                this.publishJointVelocities(); // Publish zero velocities after resize
            };
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
            this.canvas3 = this.element.querySelector('#joystickCanvas3'); // NEW: Get third canvas
            this.ctx3 = this.canvas3.getContext('2d');                     // NEW: Get third context

            // Get references to slider, value display, and status elements
            this.maxVelocitySlider = this.element.querySelector('#maxVelocity');
            this.maxVelocityValueSpan = this.element.querySelector('#maxVelocityValue');
            this.joystickStatus = this.element.querySelector('#joystickStatus');

            // Get references to joint velocity display spans
            this.joint1VelSpan = this.element.querySelector('#joint1Vel');
            this.joint2VelSpan = this.element.querySelector('#joint2Vel');
            this.joint3VelSpan = this.element.querySelector('#joint3Vel');
            this.joint4VelSpan = this.element.querySelector('#joint4Vel');
            this.joint5VelSpan = this.element.querySelector('#joint5Vel'); // NEW: Get Joint 5 span
            this.joint6VelSpan = this.element.querySelector('#joint6Vel'); // NEW: Get Joint 6 span

            // Set up and draw joysticks initially
            this.setupCanvas(this.canvas1, this.joystick1);
            this.setupCanvas(this.canvas2, this.joystick2);
            this.setupCanvas(this.canvas3, this.joystick3); // NEW: Setup third canvas

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
            // Set canvas dimensions explicitly to match desired CSS size (e.g., 80px)
            canvas.width = 80;
            canvas.height = 80;

            // Calculate joystick base radius dynamically, accounting for thumb size
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
            // Helper function to add event listeners for a single joystick
            const addJoystickListeners = (canvas, joystickState, boundHandlersObj) => {
                boundHandlersObj.mousedown = (e) => this.onMouseDown(e, canvas, joystickState);
                boundHandlersObj.mousemove = (e) => this.onMouseMove(e, canvas, joystickState);
                boundHandlersObj.mouseup = () => this.onMouseUp(joystickState);
                boundHandlersObj.mouseleave = () => this.onMouseLeave(joystickState);
                boundHandlersObj.mouseenter = () => {
                    if (!joystickState.isDragging) {
                        canvas.style.cursor = 'grab';
                    }
                };
                boundHandlersObj.touchstart = (e) => { e.preventDefault(); this.onMouseDown(e.touches[0], canvas, joystickState); };
                boundHandlersObj.touchmove = (e) => { e.preventDefault(); this.onMouseMove(e.touches[0], canvas, joystickState); };
                boundHandlersObj.touchend = () => this.onMouseUp(joystickState);
                boundHandlersObj.touchcancel = () => this.onMouseUp(joystickState);

                canvas.addEventListener('mousedown', boundHandlersObj.mousedown);
                canvas.addEventListener('mousemove', boundHandlersObj.mousemove);
                canvas.addEventListener('mouseup', boundHandlersObj.mouseup);
                canvas.addEventListener('mouseleave', boundHandlersObj.mouseleave);
                canvas.addEventListener('mouseenter', boundHandlersObj.mouseenter);
                canvas.addEventListener('touchstart', boundHandlersObj.touchstart);
                canvas.addEventListener('touchmove', boundHandlersObj.touchmove);
                canvas.addEventListener('touchend', boundHandlersObj.touchend);
                canvas.addEventListener('touchcancel', boundHandlersObj.touchcancel);
            };

            // Add listeners for all joysticks, storing their bound handlers
            addJoystickListeners(this.canvas1, this.joystick1, this.boundHandlers.canvas1);
            addJoystickListeners(this.canvas2, this.joystick2, this.boundHandlers.canvas2);
            addJoystickListeners(this.canvas3, this.joystick3, this.boundHandlers.canvas3); // NEW: Add listeners for third joystick

            // Event listener for the Max Velocity slider
            this.maxVelocitySlider.addEventListener('input', this.updateMaxVelocity);

            // Use the bound resize handler for window resize
            window.addEventListener('resize', this.boundResizeHandler);
        }

        /**
         * Removes all event listeners to prevent memory leaks, especially when the view is destroyed.
         */
        removeEventListeners() {
            // Helper function to remove event listeners for a single joystick
            const removeJoystickListeners = (canvas, boundHandlersObj) => {
                if (canvas && boundHandlersObj) {
                    canvas.removeEventListener('mousedown', boundHandlersObj.mousedown);
                    canvas.removeEventListener('mousemove', boundHandlersObj.mousemove);
                    canvas.removeEventListener('mouseup', boundHandlersObj.mouseup);
                    canvas.removeEventListener('mouseleave', boundHandlersObj.mouseleave);
                    canvas.removeEventListener('mouseenter', boundHandlersObj.mouseenter);
                    canvas.removeEventListener('touchstart', boundHandlersObj.touchstart);
                    canvas.removeEventListener('touchmove', boundHandlersObj.touchmove);
                    canvas.removeEventListener('touchend', boundHandlersObj.touchend);
                    canvas.removeEventListener('touchcancel', boundHandlersObj.touchcancel);
                }
            };

            removeJoystickListeners(this.canvas1, this.boundHandlers.canvas1);
            removeJoystickListeners(this.canvas2, this.boundHandlers.canvas2);
            removeJoystickListeners(this.canvas3, this.boundHandlers.canvas3); // NEW: Remove listeners for third joystick

            if (this.maxVelocitySlider) {
                this.maxVelocitySlider.removeEventListener('input', this.updateMaxVelocity);
            }
            // Remove the bound resize handler
            window.removeEventListener('resize', this.boundResizeHandler);
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
                if (span) { // Ensure the span element exists
                    span.textContent = `${label}: ${formatVel(value)}`;
                    if (value !== 0) {
                        span.classList.remove('zero');
                    } else {
                        span.classList.add('zero');
                    }
                }
            };

            // Update display for all six joints
            updateSpan(this.joint1VelSpan, this.joystick1.currentJoint1Vel, 'J1');
            updateSpan(this.joint2VelSpan, this.joystick1.currentJoint2Vel, 'J2');
            updateSpan(this.joint3VelSpan, this.joystick2.currentJoint3Vel, 'J3');
            updateSpan(this.joint4VelSpan, this.joystick2.currentJoint4Vel, 'J4');
            updateSpan(this.joint5VelSpan, this.joystick3.currentJoint5Vel, 'J5'); // NEW: Update J5
            updateSpan(this.joint6VelSpan, this.joystick3.currentJoint6Vel, 'J6'); // NEW: Update J6
        }

        /**
         * Draws the joystick base and thumb on the given canvas.
         * @param {HTMLCanvasElement} canvas The canvas to draw on.
         * @param {Object} joystickState The state object for the joystick.
         */
        drawJoystick(canvas, joystickState) {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw outer circle (joystick base)
            ctx.beginPath();
            ctx.arc(joystickState.centerX, joystickState.centerY, this.joystickRadius, 0, Math.PI * 2, false);
            // These colors will be overridden by CSS if your CSS is theme-aware.
            // Keeping them here for fallback/direct drawing context, but theme-aware CSS is preferred.
            ctx.strokeStyle = '#666'; // Base border color
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Semi-transparent base fill
            ctx.fill();

            // Draw thumbstick (the movable red circle)
            ctx.beginPath();
            ctx.arc(joystickState.thumbX, joystickState.thumbY, this.thumbRadius, 0, Math.PI * 2, false);
            ctx.fillStyle = '#f84632'; // Thumb fill color (red)
            ctx.fill();
            ctx.strokeStyle = '#f84632'; // Thumb border color (red)
            ctx.lineWidth = 1;
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

            const dist = Math.sqrt(
                Math.pow(mouseX - joystickState.thumbX, 2) +
                Math.pow(mouseY - joystickState.thumbY, 2)
            );

            if (dist <= this.thumbRadius + 5) {
                joystickState.isDragging = true;
                canvas.style.cursor = 'grabbing';
                this.updateThumbPosition(event, canvas, joystickState);
            }
        }

        /**
         * Handles the mouse move event for a joystick, updating thumb position if dragging.
         * @param {MouseEvent|TouchEvent} event The mouse or touch event.
         * @param {HTMLCanvasElement} canvas The canvas element.
         * @param {Object} joystickState The state object for the joystick.
         */
        onMouseMove(event, canvas, joystickState) {
            if (!joystickState.isDragging) return;
            this.updateThumbPosition(event, canvas, joystickState);
        }

        /**
         * Handles the mouse up event for a joystick, resetting thumb and velocities.
         * @param {Object} joystickState The state object for the joystick.
         */
        onMouseUp(joystickState) {
            joystickState.isDragging = false;
            // Reset cursor to default on mouse up
            if (joystickState === this.joystick1) this.canvas1.style.cursor = 'grab';
            if (joystickState === this.joystick2) this.canvas2.style.cursor = 'grab';
            if (joystickState === this.joystick3) this.canvas3.style.cursor = 'grab'; // NEW: Reset cursor for third joystick

            // Reset thumb to center
            joystickState.thumbX = joystickState.centerX;
            joystickState.thumbY = joystickState.centerY;
            this.drawJoystick(
                joystickState === this.joystick1 ? this.canvas1 :
                joystickState === this.joystick2 ? this.canvas2 :
                this.canvas3, // Select correct canvas for joystick3
                joystickState
            );

            // Set current joint velocities to zero for the released joystick
            if (joystickState === this.joystick1) {
                joystickState.currentJoint1Vel = 0;
                joystickState.currentJoint2Vel = 0;
            } else if (joystickState === this.joystick2) {
                joystickState.currentJoint3Vel = 0;
                joystickState.currentJoint4Vel = 0;
            } else if (joystickState === this.joystick3) { // NEW: Zero velocities for joystick3
                joystickState.currentJoint5Vel = 0;
                joystickState.currentJoint6Vel = 0;
            }
            this.updateJointVelocityDisplays();
            this.publishJointVelocities();
        }

        /**
         * Handles mouse leave event, stopping dragging if the mouse leaves the canvas while dragging.
         * Also resets cursor if not dragging.
         * @param {Object} joystickState The state object for the joystick.
         */
        onMouseLeave(joystickState) {
            if (joystickState.isDragging) {
                this.onMouseUp(joystickState);
            } else {
                if (joystickState === this.joystick1) this.canvas1.style.cursor = 'grab';
                if (joystickState === this.joystick2) this.canvas2.style.cursor = 'grab';
                if (joystickState === this.joystick3) this.canvas3.style.cursor = 'grab'; // NEW: Reset cursor for third joystick
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

            // Clamp thumb position within the joystick radius
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > this.joystickRadius) {
                dx *= this.joystickRadius / dist;
                dy *= this.joystickRadius / dist;
            }

            joystickState.thumbX = joystickState.centerX + dx;
            joystickState.thumbY = joystickState.centerY + dy;


            this.drawJoystick(canvas, joystickState);

            // Calculate normalized values (-1 to 1) based on thumb displacement from center
            const normalizedX = dx / this.joystickRadius;
            const normalizedY = -dy / this.joystickRadius; // Y-axis inverted: up is positive

            // Assign velocities based on which joystick is being moved
            // IMPORTANT: This logic needs to ensure only the actively dragged joystick
            // affects its assigned joints, and the other joysticks' values remain as they were,
            // or are reset to zero if they are not active. The previous logic reset ALL
            // *other* joystick's values if one was active. This is usually undesirable for 6DOF.
            // Instead, we only modify the velocities for the joystick currently being dragged.
            // When a joystick is released (onMouseUp), its velocities are reset to zero.

            if (joystickState === this.joystick1) {
                joystickState.currentJoint1Vel = normalizedX * this.maxVelocity;
                joystickState.currentJoint2Vel = normalizedY * this.maxVelocity;
            } else if (joystickState === this.joystick2) {
                joystickState.currentJoint3Vel = normalizedX * this.maxVelocity;
                joystickState.currentJoint4Vel = normalizedY * this.maxVelocity;
            } else if (joystickState === this.joystick3) { // NEW: Handle joystick3 velocities
                joystickState.currentJoint5Vel = normalizedX * this.maxVelocity;
                joystickState.currentJoint6Vel = normalizedY * this.maxVelocity;
            }
            this.updateJointVelocityDisplays();
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
                name: '/arm_joint_velocities',
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
            this.publishJointVelocities();
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
            this.joystick3.currentJoint5Vel = 0; // NEW: Zero J5
            this.joystick3.currentJoint6Vel = 0; // NEW: Zero J6
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
                    this.joystick1.currentJoint1Vel,
                    this.joystick1.currentJoint2Vel,
                    this.joystick2.currentJoint3Vel,
                    this.joystick2.currentJoint4Vel,
                    this.joystick3.currentJoint5Vel, // NEW: Include J5
                    this.joystick3.currentJoint6Vel  // NEW: Include J6
                ]
            });

            this.jointVelTopic.publish(message);
        }

        /**
         * Cleans up resources when the view is destroyed.
         */
        destroy() {
            console.log('Destroying ArmControlView...');

            this.removeEventListeners(); // Call the fixed event listener removal

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
                this.joystick3.currentJoint5Vel = 0; // NEW: Zero J5
                this.joystick3.currentJoint6Vel = 0; // NEW: Zero J6
                this.publishJointVelocities();
            }

            if (this.ros) {
                this.ros.off('connection', this.handleRosConnection);
                this.ros.off('error', this.handleRosError);
                this.ros.off('close', this.handleRosClose);
                if (this.ros.isConnected) {
                    this.ros.close();
                }
            }

            // Nullify DOM references to aid garbage collection
            this.canvas1 = null; this.ctx1 = null;
            this.canvas2 = null; this.ctx2 = null;
            this.canvas3 = null; this.ctx3 = null; // NEW: Nullify third canvas/context
            this.maxVelocitySlider = null;
            this.maxVelocityValueSpan = null;
            this.joystickStatus = null;
            this.joint1VelSpan = null;
            this.joint2VelSpan = null;
            this.joint3VelSpan = null;
            this.joint4VelSpan = null;
            this.joint5VelSpan = null; // NEW: Nullify J5 span
            this.joint6VelSpan = null; // NEW: Nullify J6 span

            this.htmlContent = null;
            this.element.innerHTML = ''; // Clear the DOM element
        }
    }

    // Expose ArmControlView globally
    window.ArmControlView = ArmControlView;

})(); // End of IIFE