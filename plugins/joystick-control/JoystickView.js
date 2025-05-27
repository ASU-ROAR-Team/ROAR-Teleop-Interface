// src/plugins/joystick-control/JoystickView.js

// IMPORTANT: Ensure roslib.min.js is loaded BEFORE this script in index.html
// e.g., <script src="https://static.robotwebtools.org/roslibjs/current/roslib.min.js"></script>

// Wrap in an IIFE to keep local variables private, but expose the main class
(function () {
    class JoystickView {
        constructor(element, openmct) {
            this.element = element;
            this.openmct = openmct;
            this.htmlContent = null; // To hold the loaded HTML

            this.canvas = null;
            this.ctx = null;
            this.joystickRadius = 0;
            this.thumbRadius = 20;
            this.joystickCenterX = 0;
            this.joystickCenterY = 0;
            this.thumbX = 0;
            this.thumbY = 0;
            this.isDragging = false;

            this.maxLinearSpeed = 1.0;
            this.maxAngularSpeed = 0.5;

            this.ros = null;
            this.cmdVelTopic = null;
            this.rosConnected = false;

            // Bind event handlers to the class instance
            this.onMouseDown = this.onMouseDown.bind(this);
            this.onMouseMove = this.onMouseMove.bind(this);
            this.onMouseUp = this.onMouseUp.bind(this);
            this.onMouseLeave = this.onMouseLeave.bind(this);
            this.updateSpeedValues = this.updateSpeedValues.bind(this);
            this.handleRosConnection = this.handleRosConnection.bind(this);
            this.handleRosError = this.handleRosError.bind(this);
            this.handleRosClose = this.handleRosClose.bind(this);
        }

        // This method is called by OpenMCT to render the view
        render() {
            // Load the HTML content
            fetch('./plugins/joystick-control/JoystickView.html')
                .then(response => response.text())
                .then(html => {
                    this.htmlContent = html;
                    this.element.innerHTML = html;
                    this.initializeUI();
                    this.connectToROS();
                })
                .catch(error => {
                    console.error('Error loading JoystickView.html:', error);
                    this.element.innerHTML = '<p style="color: red;">Error loading joystick UI.</p>';
                });
        }

        initializeUI() {
            this.canvas = this.element.querySelector('#joystickCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.linearSpeedSlider = this.element.querySelector('#linearSpeed');
            this.angularSpeedSlider = this.element.querySelector('#angularSpeed');
            this.linearSpeedValueSpan = this.element.querySelector('#linearSpeedValue');
            this.angularSpeedValueSpan = this.element.querySelector('#angularSpeedValue');
            this.joystickStatus = this.element.querySelector('#joystickStatus');

            // Set canvas dimensions based on its parent's computed style
            const wrapper = this.canvas.parentElement;
            this.canvas.width = wrapper.clientWidth;
            this.canvas.height = wrapper.clientHeight;

            this.joystickRadius = Math.min(this.canvas.width, this.canvas.height) / 2 - 10; // 10px padding
            this.joystickCenterX = this.canvas.width / 2;
            this.joystickCenterY = this.canvas.height / 2;
            this.thumbX = this.joystickCenterX;
            this.thumbY = this.joystickCenterY;

            this.drawJoystick();
            this.addEventListeners();
            this.updateSpeedValues(); // Initialize slider display
        }

        addEventListeners() {
            this.canvas.addEventListener('mousedown', this.onMouseDown);
            this.canvas.addEventListener('mousemove', this.onMouseMove);
            this.canvas.addEventListener('mouseup', this.onMouseUp);
            this.canvas.addEventListener('mouseleave', this.onMouseLeave);

            // Touch events for mobile
            this.canvas.addEventListener('touchstart', (e) => {
                e.preventDefault(); // Prevent scrolling
                this.onMouseDown(e.touches[0]);
            });
            this.canvas.addEventListener('touchmove', (e) => {
                e.preventDefault(); // Prevent scrolling
                this.onMouseMove(e.touches[0]);
            });
            this.canvas.addEventListener('touchend', this.onMouseUp);
            this.canvas.addEventListener('touchcancel', this.onMouseUp);

            this.linearSpeedSlider.addEventListener('input', this.updateSpeedValues);
            this.angularSpeedSlider.addEventListener('input', this.updateSpeedValues);

            // Handle window resize to redraw canvas
            window.addEventListener('resize', () => {
                if (this.canvas) {
                    const wrapper = this.canvas.parentElement;
                    this.canvas.width = wrapper.clientWidth;
                    this.canvas.height = wrapper.clientHeight;
                    this.joystickRadius = Math.min(this.canvas.width, this.canvas.height) / 2 - 10;
                    this.joystickCenterX = this.canvas.width / 2;
                    this.joystickCenterY = this.canvas.height / 2;
                    // Reset thumb position on resize
                    this.thumbX = this.joystickCenterX;
                    this.thumbY = this.joystickCenterY;
                    this.drawJoystick();
                    this.publishTwist(0, 0); // Send zero twist on resize
                }
            });
        }

        removeEventListeners() {
            if (this.canvas) {
                this.canvas.removeEventListener('mousedown', this.onMouseDown);
                this.canvas.removeEventListener('mousemove', this.onMouseMove);
                this.canvas.removeEventListener('mouseup', this.onMouseUp);
                this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
                this.canvas.removeEventListener('touchstart', this.onMouseDown);
                this.canvas.removeEventListener('touchmove', this.onMouseMove);
                this.canvas.removeEventListener('touchend', this.onMouseUp);
                this.canvas.removeEventListener('touchcancel', this.onMouseUp);
            }
            if (this.linearSpeedSlider) {
                this.linearSpeedSlider.removeEventListener('input', this.updateSpeedValues);
            }
            if (this.angularSpeedSlider) {
                this.angularSpeedSlider.removeEventListener('input', this.updateSpeedValues);
            }
            window.removeEventListener('resize', this.drawJoystick);
        }

        updateSpeedValues() {
            this.maxLinearSpeed = parseFloat(this.linearSpeedSlider.value);
            this.maxAngularSpeed = parseFloat(this.angularSpeedSlider.value);
            this.linearSpeedValueSpan.textContent = this.maxLinearSpeed.toFixed(1);
            this.angularSpeedValueSpan.textContent = this.maxAngularSpeed.toFixed(1);
        }

        drawJoystick() {
            if (!this.ctx) return;

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Draw outer circle (joystick base)
            this.ctx.beginPath();
            this.ctx.arc(this.joystickCenterX, this.joystickCenterY, this.joystickRadius, 0, Math.PI * 2, false);
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            this.ctx.fill();

            // Draw thumbstick
            this.ctx.beginPath();
            this.ctx.arc(this.thumbX, this.thumbY, this.thumbRadius, 0, Math.PI * 2, false);
            this.ctx.fillStyle = '#f84632'; /* Accent color */
            this.ctx.fill();
            this.ctx.strokeStyle = '#f84632'; /* Primary color */
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        onMouseDown(event) {
            this.isDragging = true;
            this.canvas.style.cursor = 'grabbing';
            this.updateThumbPosition(event);
        }

        onMouseMove(event) {
            if (!this.isDragging) return;
            this.updateThumbPosition(event);
        }

        onMouseUp() {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
            // Reset thumb to center
            this.thumbX = this.joystickCenterX;
            this.thumbY = this.joystickCenterY;
            this.drawJoystick();
            this.publishTwist(0, 0); // Send zero twist when released
        }

        onMouseLeave() {
            if (this.isDragging) { // If mouse leaves while dragging, treat as mouse up
                this.onMouseUp();
            }
        }

        updateThumbPosition(event) {
            const rect = this.canvas.getBoundingClientRect();
            let mouseX = event.clientX - rect.left;
            let mouseY = event.clientY - rect.top;

            // Calculate distance from center
            let dx = mouseX - this.joystickCenterX;
            let dy = mouseY - this.joystickCenterY;
            let distance = Math.sqrt(dx * dx + dy * dy);

            // Clamp thumb position within the joystick boundary
            if (distance > this.joystickRadius) {
                let angle = Math.atan2(dy, dx);
                this.thumbX = this.joystickCenterX + this.joystickRadius * Math.cos(angle);
                this.thumbY = this.joystickCenterY + this.joystickRadius * Math.sin(angle);
            } else {
                this.thumbX = mouseX;
                this.thumbY = mouseY;
            }

            this.drawJoystick();

            // Normalize values to -1 to 1 range
            const normalizedX = (this.thumbX - this.joystickCenterX) / this.joystickRadius;
            const normalizedY = -(this.thumbY - this.joystickCenterY) / this.joystickRadius; // Y-axis inverted for linear speed (up is positive)

            this.publishTwist(normalizedX, normalizedY);
        }

        connectToROS() {
            if (typeof window.ROSLIB === 'undefined') {
                console.error("ROSLIB is not defined. Please ensure roslib.min.js is loaded.");
                this.joystickStatus.textContent = 'ROSLIB not found!';
                this.joystickStatus.classList.add('error');
                return;
            }

            this.ros = new window.ROSLIB.Ros({
                url: 'ws://localhost:9090' // Default rosbridge_server websocket URL
            });

            this.ros.on('connection', this.handleRosConnection);
            this.ros.on('error', this.handleRosError);
            this.ros.on('close', this.handleRosClose);

            // Initialize the publisher
            this.cmdVelTopic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel', // Standard topic for velocity commands
                messageType: 'geometry_msgs/Twist'
            });
        }

        handleRosConnection() {
            console.log('Connected to ROS websocket server.');
            this.rosConnected = true;
            this.joystickStatus.textContent = 'Connected to ROS';
            this.joystickStatus.classList.remove('error');
            this.joystickStatus.classList.add('connected');
        }

        handleRosError(error) {
            console.error('Error connecting to ROS websocket server: ', error);
            this.rosConnected = false;
            this.joystickStatus.textContent = 'ROS Connection Error!';
            this.joystickStatus.classList.remove('connected');
            this.joystickStatus.classList.add('error');
        }

        handleRosClose() {
            console.log('Connection to ROS websocket server closed.');
            this.rosConnected = false;
            this.joystickStatus.textContent = 'Disconnected from ROS';
            this.joystickStatus.classList.remove('connected');
            this.joystickStatus.classList.add('error');
            // Attempt to reconnect after a delay
            setTimeout(() => {
                console.log('Attempting to reconnect to ROS...');
                this.connectToROS();
            }, 3000); // Reconnect after 3 seconds
        }

        publishTwist(normalizedX, normalizedY) {
            if (!this.rosConnected || !this.cmdVelTopic) {
                console.warn('Not connected to ROS or cmd_vel topic not initialized. Cannot publish Twist message.');
                return;
            }

            const linearSpeed = normalizedY * this.maxLinearSpeed;
            const angularSpeed = -normalizedX * this.maxAngularSpeed; // Negative for standard right turn (clockwise) with positive X

            const twist = new window.ROSLIB.Message({
                linear: {
                    x: linearSpeed,
                    y: 0.0,
                    z: 0.0
                },
                angular: {
                    x: 0.0,
                    y: 0.0,
                    z: angularSpeed
                }
            });

            this.cmdVelTopic.publish(twist);
            // console.log(`Published Twist: Linear X=${linearSpeed.toFixed(2)}, Angular Z=${angularSpeed.toFixed(2)}`);
        }

        // This method is crucial for cleaning up resources when the view is destroyed by OpenMCT
        destroy() {
            console.log('Destroying JoystickView...');
            this.removeEventListeners();
            if (this.ros) {
                // Remove ROS event listeners to prevent memory leaks
                this.ros.off('connection', this.handleRosConnection);
                this.ros.off('error', this.handleRosError);
                this.ros.off('close', this.handleRosClose);
                // Close the ROS connection if it's still open
                if (this.ros.isConnected) {
                    this.ros.close();
                }
            }
            this.canvas = null;
            this.ctx = null;
            this.linearSpeedSlider = null;
            this.angularSpeedSlider = null;
            this.linearSpeedValueSpan = null;
            this.angularSpeedValueSpan = null;
            this.joystickStatus = null;
            this.htmlContent = null;
            this.element.innerHTML = ''; // Clear the DOM element
        }
    }

    // Expose JoystickView globally
    window.JoystickView = JoystickView;

})(); // End of IIFE
