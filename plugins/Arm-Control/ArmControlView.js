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
            // NEW: References for the new input boxes
            this.joint1Input = null;
            this.joint2Input = null;
            this.joint3Input = null;
            this.joint4Input = null;
            this.joint5Input = null;
            this.joint6Input = null;
            
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
            // NEW: References for the storage control switches
            this.regolithStorageToggle = null;
            this.rockStorageToggle = null;
            
            // NEW: References for the new joint state display blocks
            this.jointStateDisplay = {};
            for (let i = 1; i <= 6; i++) {
                this.jointStateDisplay[`joint${i}`] = null;
            }

            this.ros = null;
            this.rosConnected = false;

            // Declare ROS topics as properties to be initialized later
            this.jointCommandTopic = null;
            this.poseCommandTopic = null;
            this.currentPoseListener = null;
            this.camera1Topic = null;
            this.camera2Topic = null;
            // NEW: ROS topics for the storage control
            this.regolithStorageTopic = null;
            this.rockStorageTopic = null;
            // NEW: ROS topic for joint states
            this.jointStateListener = null;

            // Throttle for camera feed updates to prevent flickering (target ~15 FPS)
            this.lastCamera1Update = 0;
            this.lastCamera2Update = 0;
            const THROTTLE_RATE_MS = 66; // 1000ms / 15fps = ~66ms per frame

            // Bind event handlers to the instance
            this.handleSliderInput = this.handleSliderInput.bind(this);
            // NEW: Bind the new input handler
            this.handleJointInput = this.handleJointInput.bind(this);
            this.handleRosConnection = this.handleRosConnection.bind(this);
            this.handleRosError = this.handleRosError.bind(this);
            this.handleRosClose = this.handleRosClose.bind(this);
            this.boundResizeHandler = this.createBoundResizeHandler();
            this.toggleMode = this.toggleMode.bind(this);
            this.publishPoseCommand = this.publishPoseCommand.bind(this);
            this.publishJointCommand = this.publishJointCommand.bind(this);
            this.handlePoseUpdate = this.handlePoseUpdate.bind(this);
            this.handleJointStateUpdate = this.handleJointStateUpdate.bind(this);
            this.publishBooleanMessage = this.publishBooleanMessage.bind(this); // NEW: Bind the new function
            this.handleKeydown = this.handleKeydown.bind(this); // NEW: Bind the new function
            // NEW: Bind the new joint state handler
            this.handleRobotJointState = this.handleRobotJointState.bind(this);

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
            // NEW: Get references to the new input boxes
            this.joint1Input = this.element.querySelector('#joint1Input');
            this.joint2Input = this.element.querySelector('#joint2Input');
            this.joint3Input = this.element.querySelector('#joint3Input');
            this.joint4Input = this.element.querySelector('#joint4Input');
            this.joint5Input = this.element.querySelector('#joint5Input');
            this.joint6Input = this.element.querySelector('#joint6Input');
            

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
            // NEW: Get references to the new storage toggles
            this.regolithStorageToggle = this.element.querySelector('#regolithStorageToggle');
            this.rockStorageToggle = this.element.querySelector('#rockStorageToggle');
            
            // NEW: Get references to the joint state display blocks
            for (let i = 1; i <= 6; i++) {
                this.jointStateDisplay[`joint${i}`] = this.element.querySelector(`#joint${i}State`);
            }


            this.addEventListeners();
            this.addPresetButtonListeners();
            this.addKeyboardListeners(); // NEW: Add keyboard listeners

            // Set initial UI state
            this.updateUIState();
            this.updateJointValueDisplays();
        }

        /**
         * Adds all event listeners for sliders, inputs, and buttons.
         */
        addEventListeners() {
            // Helper function to add event listeners to sliders and their corresponding inputs
            const addJointControlListeners = (slider, input) => {
                if (slider && input) {
                    slider.addEventListener('input', this.handleSliderInput);
                    input.addEventListener('change', this.handleJointInput);
                }
            };
            
            addJointControlListeners(this.joint1Slider, this.joint1Input);
            addJointControlListeners(this.joint2Slider, this.joint2Input);
            addJointControlListeners(this.joint3Slider, this.joint3Input);
            addJointControlListeners(this.joint4Slider, this.joint4Input);
            addJointControlListeners(this.joint5Slider, this.joint5Input);
            addJointControlListeners(this.joint6Slider, this.joint6Input);
            
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

            // NEW: Add event listeners for the storage toggles
            if (this.regolithStorageToggle) {
                this.regolithStorageToggle.addEventListener('change', () => {
                    this.publishBooleanMessage(this.regolithStorageTopic, this.regolithStorageToggle.checked);
                });
            }
            if (this.rockStorageToggle) {
                this.rockStorageToggle.addEventListener('change', () => {
                    this.publishBooleanMessage(this.rockStorageTopic, this.rockStorageToggle.checked);
                });
            }
        }
        
        /**
         * Handles the input event for the number input boxes.
         * Updates the corresponding slider and triggers the joint command.
         */
        handleJointInput(event) {
            const inputElement = event.target;
            const jointNumber = inputElement.id.replace('joint', '').replace('Input', '');
            const slider = this.element.querySelector(`#joint${jointNumber}Slider`);
            const value = parseFloat(inputElement.value);

            // Ensure the value is within the slider's range
            const clampedValue = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), value));
            
            // Update the slider's value to match the input
            slider.value = clampedValue;
            
            // Now, trigger the same logic as the slider input
            this.handleSliderInput({ target: slider });
        }

        /**
 * Attaches event listeners to the preset buttons.
 * This function is now much cleaner and easier to maintain by using an array of presets.
 */
        addPresetButtonListeners() {
            // Define an array of preset configurations.
            // Each object contains the button ID and the corresponding joint values in degrees.
            const presets = [
                {
                    id: 'presetButton1',
                    values: {
                        joint1: 16.530,
                        joint2: 155.352,
                        joint3: 117.668,
                        joint4: 177.966,
                        joint5: -17.504,
                        joint6: 0.000
                    }
                },
                {
                    id: 'presetButton2',
                    values: {
                        joint1: 0.0,
                        joint2: 0.0,
                        joint3: 0.0,
                        joint4: 0.0,
                        joint5: 0.0,
                        joint6: 0.0
                    }
                },
                {
                    id: 'presetButton3',
                    values: {
                        joint1: -106.003,
                        joint2: 112.323,
                        joint3: 181.851,
                        joint4: 179.909,
                        joint5: -17.504,
                        joint6: 0.0
                    }
                }
            ];

            // Loop through each preset to attach the event listener
            presets.forEach(preset => {
                const button = this.element.querySelector(`#${preset.id}`);
                if (button) {
                    button.addEventListener('click', () => {
                        // When the button is clicked, first update the local jointValues object
                        this.jointValues = { ...preset.values };

                        // Then, update the UI elements (sliders and input boxes)
                        // We use Object.keys to iterate over the joint values dynamically
                        Object.keys(this.jointValues).forEach(joint => {
                            // Update the slider's value
                            const slider = this[`${joint}Slider`];
                            if (slider) {
                                slider.value = this.jointValues[joint];
                            }

                            // Update the input box's value
                            const input = this[`${joint}Input`];
                            if (input) {
                                input.value = this.jointValues[joint].toFixed(2);
                            }
                        });

                        // Publish the new joint command to ROS
                        this.publishJointCommand(
                            this.jointValues.joint1,
                            this.jointValues.joint2,
                            this.jointValues.joint3,
                            this.jointValues.joint4,
                            this.jointValues.joint5,
                            this.jointValues.joint6
                        );

                        // Update the joint velocity displays on the UI
                        this.updateJointValueDisplays();
                    });
                }
            });
        }

        /**
         * Adds keyboard event listeners to control sliders.
         */
        addKeyboardListeners() {
            window.addEventListener('keydown', this.handleKeydown);
        }

        /**
         * Handles keyboard keydown events to control sliders.
         * @param {KeyboardEvent} event The keyboard event object.
         */
        handleKeydown(event) {
            if (this.currentMode !== 'FK') {
                return; // Only allow keyboard control in FK mode
            }

            const step = 1.0; // Amount to increment/decrement the slider
            let sliderToUpdate = null;
            let direction = 0;

            switch (event.key) {
                case 'q':
                    sliderToUpdate = this.joint1Slider;
                    direction = -1;
                    break;
                case 'w':
                    sliderToUpdate = this.joint1Slider;
                    direction = 1;
                    break;
                case 'a':
                    sliderToUpdate = this.joint2Slider;
                    direction = -1;
                    break;
                case 's':
                    sliderToUpdate = this.joint2Slider;
                    direction = 1;
                    break;
                case 'z':
                    sliderToUpdate = this.joint3Slider;
                    direction = -1;
                    break;
                case 'x':
                    sliderToUpdate = this.joint3Slider;
                    direction = 1;
                    break;
                case 'e':
                    sliderToUpdate = this.joint4Slider;
                    direction = -1;
                    break;
                case 'r':
                    sliderToUpdate = this.joint4Slider;
                    direction = 1;
                    break;
                case 'd':
                    sliderToUpdate = this.joint5Slider;
                    direction = -1;
                    break;
                case 'f':
                    sliderToUpdate = this.joint5Slider;
                    direction = 1;
                    break;
                case 'c':
                    sliderToUpdate = this.joint6Slider;
                    direction = -1;
                    break;
                case 'v':
                    sliderToUpdate = this.joint6Slider;
                    direction = 1;
                    break;
            }

            if (sliderToUpdate) {
                event.preventDefault(); // Prevent default browser actions
                let newValue = parseFloat(sliderToUpdate.value) + (direction * step);

                // Ensure the new value is within the slider's min/max range
                newValue = Math.max(parseFloat(sliderToUpdate.min), Math.min(parseFloat(sliderToUpdate.max), newValue));
                
                sliderToUpdate.value = newValue;
                this.handleSliderInput({ target: sliderToUpdate });
            }
        }

        /**
         * Handles slider input events. Publishes joint commands only in FK mode.
         * The message type is now PoseStamped, which requires a forward kinematics
         * calculation to get the end-effector position. This code provides
         * placeholder values for demonstration.
         */
        handleSliderInput(event) {
            const slider = event.target;
            const jointNumber = slider.id.replace('joint', '').replace('Slider', '');
            const inputElement = this.element.querySelector(`#joint${jointNumber}Input`);
            
            // Update the corresponding input field in real-time
            if (inputElement) {
                inputElement.value = slider.value;
            }

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
            // NEW: Include inputs in the update
            const inputs = [this.joint1Input, this.joint2Input, this.joint3Input, this.joint4Input, this.joint5Input, this.joint6Input];
            const poseButtons = [this.poseXPlusButton, this.poseXMinusButton, this.poseYPlusButton, this.poseYMinusButton, this.poseZPlusButton, this.poseZMinusButton];
            const presetButtons = [this.presetButton1, this.presetButton2, this.presetButton3];
            
            if (this.currentMode === 'FK') {
                this.modeSwitchButton.textContent = 'Switch to IK Mode';

                // Enable sliders, inputs, and preset buttons. Disable pose controls.
                sliders.forEach(slider => slider.disabled = false);
                inputs.forEach(input => input.disabled = false);
                presetButtons.forEach(button => button.disabled = false);
                poseButtons.forEach(button => button.disabled = true);
                
                // Subscribe to pose feedback and unsubscribe from joint feedback
                if (this.currentPoseListener) this.currentPoseListener.subscribe(this.handlePoseUpdate);
                if (this.jointCommandTopic) this.jointCommandTopic.unsubscribe();

            } else if (this.currentMode === 'IK') {
                this.modeSwitchButton.textContent = 'Switch to FK Mode';

                // Disable sliders, inputs, and preset buttons. Enable pose controls.
                sliders.forEach(slider => slider.disabled = true);
                inputs.forEach(input => input.disabled = true);
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
        
        // NEW: This function publishes a boolean message to a specified topic
        /**
         * Publishes a boolean message to a specified topic.
         * @param {ROSLIB.Topic} topic The ROSLIB.Topic object to publish to.
         * @param {boolean} value The boolean value to publish.
         */
        publishBooleanMessage(topic, value) {
            if (!this.rosConnected || !topic) {
                console.warn('ROS is not connected or topic is not initialized.');
                return;
            }
            const boolMessage = new window.ROSLIB.Message({
                data: value
            });
            topic.publish(boolMessage);
            console.log(`Published to ${topic.name}: ${value}`);
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
                // The message.data format is incorrect for direct assignment in your current logic.
                // Assuming it's the correct format for a moment, let's update both sliders and inputs.
                const sliders = [
                    this.joint1Slider, this.joint2Slider, this.joint3Slider,
                    this.joint4Slider, this.joint5Slider, this.joint6Slider
                ];
                const inputs = [
                    this.joint1Input, this.joint2Input, this.joint3Input,
                    this.joint4Input, this.joint5Input, this.joint6Input
                ];

                const values = [
                    message.pose.position.x,
                    message.pose.position.y,
                    message.pose.position.z,
                    message.pose.orientation.x,
                    message.pose.orientation.y,
                    message.pose.orientation.z
                ];

                for (let i = 0; i < values.length; i++) {
                    const val = values[i].toFixed(1);
                    if (sliders[i]) {
                        sliders[i].value = val;
                        this.jointValues[`joint${i+1}`] = parseFloat(val);
                    }
                    if (inputs[i]) {
                        inputs[i].value = val;
                    }
                }
                
                this.updateJointValueDisplays();
            }
        }
        
        // NEW: Handles incoming Float64MultiArray messages and updates the UI displays
        /**
         * Handles incoming Float64MultiArray messages and updates the joint state display blocks.
         * @param {ROSLIB.Message} message The incoming ROS message.
         */
        handleRobotJointState(message) {
            // Ensure the data array has at least 6 elements
            if (message.data && message.data.length >= 6) {
                for (let i = 0; i < 6; i++) {
                    const joint = `joint${i + 1}`;
                    const displayElement = this.jointStateDisplay[joint];
                    if (displayElement) {
                        // Display the value with a fixed number of decimal places for readability
                        displayElement.textContent = message.data[i].toFixed(2);
                    }
                }
            } else {
                console.warn("Received joint state message with unexpected data format or length.");
            }
        }

        /**
         * Updates the displayed joint velocity values and the input boxes.
         */
        updateJointValueDisplays() {
            const formatVal = (val) => val.toFixed(1);

            if (this.joint1VelSpan) this.joint1VelSpan.textContent = `J1: `;
            if (this.joint2VelSpan) this.joint2VelSpan.textContent = `J2: `;
            if (this.joint3VelSpan) this.joint3VelSpan.textContent = `J3: `;
            if (this.joint4VelSpan) this.joint4VelSpan.textContent = `J4: `;
            if (this.joint5VelSpan) this.joint5VelSpan.textContent = `J5: `;
            if (this.joint6VelSpan) this.joint6VelSpan.textContent = `EE: `;
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

            // NEW: Initialize topics for the storage toggles
            this.regolithStorageTopic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/robot/regolith_storage',
                messageType: 'std_msgs/Bool'
            });

            this.rockStorageTopic = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/robot/rock_storage',
                messageType: 'std_msgs/Bool'
            });
            
            // NEW: Initialize the joint state topic
            this.jointStateListener = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/robot/joint_states',
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

            // Initialize all topics once after connection
            this.initializeTopics();

            // Set up initial subscriptions based on the default FK mode
            this.updateUIState();

            // Subscribe to camera topics
            this.camera1Topic.subscribe(this.handleCamera1Message);
            this.camera2Topic.subscribe(this.handleCamera2Message);
            
            // NEW: Subscribe to the joint state topic
            this.jointStateListener.subscribe(this.handleRobotJointState);
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
            if (this.jointStateListener) { this.jointStateListener.unsubscribe(); }

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
            // NEW: Unsubscribe from the storage topics
            if (this.regolithStorageTopic) { this.regolithStorageTopic.unsubscribe(); }
            if (this.rockStorageTopic) { this.rockStorageTopic.unsubscribe(); }
            // NEW: Unsubscribe from the joint state topic
            if (this.jointStateListener) { this.jointStateListener.unsubscribe(); }

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
