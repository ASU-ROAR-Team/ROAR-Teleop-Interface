// src/plugins/Drilling-Control/DrillingControlView.js

(function () {
    class DrillingControlView {
        constructor(element, openmct) {
            this.element = element;
            this.openmct = openmct;
            console.log("DrillingControlView constructor: this.openmct is", this.openmct); 

            this.ros = null;
            this.rosConnected = false;
            this.drillingManualInputPublisher = null; 
            this.drillingStatusSubscriber = null;
            this.fsmStateSubscriber = null;
            this.roverStatusSubscriber = null;
            this.currentRoverState = { rover_state: 'IDLE', active_mission: '' };

            this.rosStatusDot = null;
            this.rosStatus = null;
            this.fsmStateDisplay = null;
            this.platformDepthDisplay = null;
            this.sampleWeightDisplay = null;

            this.platformUpButton = null;
            this.platformDownButton = null;
            this.augerToggleSwitch = null; // New: Reference for auger switch
            this.gateToggleSwitch = null; // New: Reference for gate switch

            this.currentManualInputState = {
                manual_up: false,
                manual_down: false,
                auger_on: false,
                gate_open: false
            };

            this.webcamVideoElement = null;
            this.webcamMediaStream = null;
            this.webcamStatusMessageElement = null;
            this.webcamSnapshotButton = null;
            this.webcamInnerSnapshotCircle = null;
        }

        handleRosConnection = () => {
            console.log('Connected to ROS websocket server.');
            this.rosConnected = true;
            if (this.rosStatus) {
                this.rosStatus.textContent = 'Connected to ROS';
                this.rosStatus.classList.remove('error');
                this.rosStatus.classList.add('connected');
            }
            if (this.rosStatusDot) {
                this.rosStatusDot.classList.remove('error');
                this.rosStatusDot.classList.add('connected');
            }
        };

        handleRosError = (error) => {
            console.error('ROS connection error:', error);
            this.rosConnected = false;
            if (this.rosStatus) {
                this.rosStatus.textContent = 'ROS Connection Error!';
                this.rosStatus.classList.remove('connected');
                this.rosStatus.classList.add('error');
            }
            if (this.rosStatusDot) {
                this.rosStatusDot.classList.remove('connected');
                this.rosStatusDot.classList.add('error');
            }
        };

        handleRosClose = () => {
            console.warn('ROS connection closed. Attempting to reconnect...');
            this.rosConnected = false;
            if (this.rosStatus) {
                this.rosStatus.textContent = 'Disconnected from ROS';
                this.rosStatus.classList.remove('connected');
                this.rosStatus.classList.add('error');
            }
            if (this.rosStatusDot) {
                this.rosStatusDot.classList.remove('connected');
                this.rosStatusDot.classList.add('error');
            }
            setTimeout(() => {
                console.log('Attempting to reconnect to ROS...');
                this.connectToROS();
            }, 3000);
        };

        handleEditModeChange = (isEditing) => {
            if (isEditing) {
                this.stopWebcam();
                this.displayWebcamStatus('Webcam: In edit mode. Stream paused.', 'info');
            } else {
                this.startWebcam();
            }
        };
        
        displayWebcamStatus = (message, type = 'info') => {
            if (this.webcamStatusMessageElement) {
                this.webcamStatusMessageElement.textContent = message;
                this.webcamStatusMessageElement.classList.remove('info', 'error', 'warning');
                this.webcamStatusMessageElement.classList.add(type);
                this.webcamStatusMessageElement.style.display = 'block';
            }
        };

        hideWebcamStatus = () => {
            if (this.webcamStatusMessageElement) {
                this.webcamStatusMessageElement.textContent = '';
                this.webcamStatusMessageElement.classList.remove('info', 'error', 'warning');
                this.webcamStatusMessageElement.style.display = 'none';
            }
        };

        startWebcam = async () => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.displayWebcamStatus('Webcam not supported by this browser.', 'error');
                console.error('Webcam not supported by this browser.');
                return;
            }

            if (!this.webcamVideoElement) {
                this.displayWebcamStatus('Webcam display element not found. Please ensure HTML is correct.', 'error');
                console.error('Webcam video element is null when startWebcam is called.');
                return;
            }

            try {
                this.displayWebcamStatus('Requesting webcam access...', 'info');
                this.webcamMediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                this.webcamVideoElement.srcObject = this.webcamMediaStream;
                this.webcamVideoElement.play();
                this.webcamVideoElement.style.display = 'block';
                this.hideWebcamStatus();
                if (this.webcamSnapshotButton) {
                    this.webcamSnapshotButton.style.display = 'flex';
                }
                console.log('Webcam stream started.');
            } catch (err) {
                this.displayWebcamStatus('Failed to access webcam. Ensure it\'s connected and permissions are granted.', 'error');
                console.error('Error accessing webcam:', err);
                if (this.webcamVideoElement) {
                    this.webcamVideoElement.style.display = 'none';
                }
                if (this.webcamSnapshotButton) {
                    this.webcamSnapshotButton.style.display = 'none';
                }
            }
        };

        stopWebcam = () => {
            if (this.webcamMediaStream) {
                this.webcamMediaStream.getTracks().forEach(track => track.stop());
                this.webcamMediaStream = null;
                if (this.webcamVideoElement) {
                    this.webcamVideoElement.srcObject = null;
                    this.webcamVideoElement.style.display = 'none';
                }
                console.log('Webcam stream stopped.');
            }
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.style.display = 'none';
            }
            this.displayWebcamStatus('Webcam stream paused/stopped.', 'info');
        };

        takeWebcamSnapshot = () => {
            if (this.openmct && this.openmct.notifications) {
                this.openmct.notifications.info('Snapshot functionality is not implemented without canvas.');
            }
            console.warn('Snapshot functionality is not implemented in this version.');
        };

        handleSnapshotButtonMouseDown = () => {
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.style.transform = 'translateX(-50%) scale(0.95)';
                this.webcamSnapshotButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            }
        };

        handleSnapshotButtonMouseUp = () => {
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.style.transform = 'translateX(-50%) scale(1)';
                this.webcamSnapshotButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
            }
        };

        handleSnapshotButtonMouseLeave = () => {
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.style.transform = 'translateX(-50%) scale(1)';
                this.webcamSnapshotButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
            }
        };

        render() {
            fetch('./plugins/Drilling-Control/DrillingControlView.html')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.text();
                })
                .then(html => {
                    this.element.innerHTML = html;
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = './plugins/Drilling-Control/DrillingControlView.css';
                    document.head.appendChild(link);

                    this.initializeUI();
                    this.connectToROS();
                    this.openmct.editor.on('isEditing', this.handleEditModeChange); 
                })
                .catch(error => {
                    console.error('Error loading DrillingControlView.html:', error);
                    this.element.innerHTML = `<p style="color: red;">Error loading drilling control UI.</p>`;
                });
        }

        initializeUI() {
            this.rosStatusDot = this.element.querySelector('#drillingRosStatusDot');
            this.rosStatus = this.element.querySelector('#drillingRosStatus');
            this.fsmStateDisplay = this.element.querySelector('#drillingFsmState');
            this.platformDepthDisplay = this.element.querySelector('#drillingPlatformDepth');
            this.sampleWeightDisplay = this.element.querySelector('#drillingSampleWeight');

            this.platformUpButton = this.element.querySelector('#drillingPlatformUpButton');
            this.platformDownButton = this.element.querySelector('#drillingPlatformDownButton');
            this.augerToggleSwitch = this.element.querySelector('#drillingAugerToggle');
            this.gateToggleSwitch = this.element.querySelector('#drillingGateToggle');

            const webcamContainer = this.element.querySelector('#drillingWebcamContainer');
            if (webcamContainer) {
                this.webcamVideoElement = webcamContainer.querySelector('#drillingWebcamVideo');
                this.webcamSnapshotButton = webcamContainer.querySelector('#drillingSnapshotButton');
                this.webcamInnerSnapshotCircle = this.webcamSnapshotButton.querySelector('.drilling-snapshot-inner-circle');
                this.webcamStatusMessageElement = webcamContainer.querySelector('#drillingWebcamStatusMessage');

                if (this.webcamVideoElement) {
                    this.webcamVideoElement.style.display = 'none';
                }
                if (this.webcamSnapshotButton) {
                    this.webcamSnapshotButton.style.display = 'none';
                }
                if (this.webcamStatusMessageElement) {
                    this.webcamStatusMessageElement.style.display = 'block';
                    this.displayWebcamStatus('Loading webcam...', 'info');
                }
            } else {
                console.error("DrillingControlView: #drillingWebcamContainer not found in HTML. Webcam functionality will not work.");
                const webcamAreaDiv = this.element.querySelector('.drilling-webcam-feed-wrapper');
                if (webcamAreaDiv) {
                    webcamAreaDiv.innerHTML = `<p style="color: red; text-align: center; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">Error: Webcam container not found in HTML. Please ensure 'drillingWebcamContainer' ID exists.</p>`;
                }
            }

            this.addEventListeners();
            this.startWebcam();
            this.updateManualControlUIState();
        }

        addEventListeners() {
            const addMomentaryListener = (button, command, value) => {
                if (button) {
                    button.addEventListener('mousedown', () => { if (!button.disabled) this.handleManualButtonClick(command, value); });
                    button.addEventListener('mouseup', () => { if (!button.disabled) this.handleManualButtonClick(command, false); });
                    button.addEventListener('mouseleave', () => { if (!button.disabled) this.handleManualButtonClick(command, false); });
                }
            };
            addMomentaryListener(this.platformUpButton, 'manual_up', true);
            addMomentaryListener(this.platformDownButton, 'manual_down', true);

            // New: Add change listeners for switches
            if (this.augerToggleSwitch) {
                this.augerToggleSwitch.addEventListener('change', () => {
                    this.handleSwitchChange('auger_on', this.augerToggleSwitch.checked);
                });
            }
            if (this.gateToggleSwitch) {
                this.gateToggleSwitch.addEventListener('change', () => {
                    this.handleSwitchChange('gate_open', this.gateToggleSwitch.checked);
                });
            }

            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.addEventListener('click', this.takeWebcamSnapshot);
                this.webcamSnapshotButton.addEventListener('mousedown', this.handleSnapshotButtonMouseDown);
                this.webcamSnapshotButton.addEventListener('mouseup', this.handleSnapshotButtonMouseUp);
                this.webcamSnapshotButton.addEventListener('mouseleave', this.handleSnapshotButtonMouseLeave);
            }
        }
        
        // New: handle switch changes
        handleSwitchChange(commandType, value) {
            if (this.currentRoverState.active_mission.toLowerCase() !== 'teleoperation') {
                // Revert the switch state if not in the correct mode
                if (commandType === 'auger_on') {
                    this.augerToggleSwitch.checked = !value;
                } else if (commandType === 'gate_open') {
                    this.gateToggleSwitch.checked = !value;
                }
                if (this.openmct && this.openmct.notifications) {
                    this.openmct.notifications.warn('Manual controls are disabled outside of Teleoperation mode.');
                }
                return;
            }
            this.currentManualInputState[commandType] = value;
            this.sendDrillingManualInput(this.currentManualInputState);
        }

        sendDrillingManualInput(inputState) {
            if (this.currentRoverState.active_mission.toLowerCase() !== 'teleoperation') {
                console.warn('Not in Teleoperation mode. Manual command not sent.');
                if (this.openmct && this.openmct.notifications) {
                    this.openmct.notifications.warn('Manual controls are disabled outside of Teleoperation mode.');
                }
                return;
            }

            if (!this.rosConnected || !this.drillingManualInputPublisher) {
                console.warn('ROS is not connected or manual input publisher is not initialized. Input not sent.');
                return;
            }

            if (typeof ROSLIB === 'undefined' || typeof ROSLIB.Message === 'undefined') {
                console.error('ROSLIB or ROSLIB.Message is not defined. Cannot send manual input.');
                return;
            }

            const drillingManualInputMsg = new ROSLIB.Message({
                manual_up: inputState.manual_up,
                manual_down: inputState.manual_down,
                auger_on: inputState.auger_on,
                gate_open: inputState.gate_open
            });

            this.drillingManualInputPublisher.publish(drillingManualInputMsg);
            console.log("Published Drilling Manual Input:", drillingManualInputMsg);
        }

        handleManualButtonClick(commandType, value) {
            if (this.currentRoverState.active_mission.toLowerCase() !== 'teleoperation') {
                return;
            }

            this.currentManualInputState[commandType] = value;
            
            if (commandType === 'manual_up' && value) {
                this.currentManualInputState.manual_down = false;
            } else if (commandType === 'manual_down' && value) {
                this.currentManualInputState.manual_up = false;
            }
            
            this.sendDrillingManualInput(this.currentManualInputState);
        }

        connectToROS() {
            if (typeof window.ROSLIB === 'undefined') {
                console.error("ROSLIB is not defined. Ensure ros-lib.js is loaded.");
                this.updateRosStatus(false, 'ROSLIB not loaded');
                return;
            }

            this.ros = new window.ROSLIB.Ros({ url: 'ws://localhost:9090' });
            this.ros.on('connection', this.handleRosConnection);
            this.ros.on('error', this.handleRosError);
            this.ros.on('close', this.handleRosClose);

            this.drillingManualInputPublisher = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/drilling/manual_input',
                messageType: 'roar_msgs/DrillingManualInput'
            });

            this.drillingStatusSubscriber = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/drilling/feedback',
                messageType: 'roar_msgs/DrillingStatus'
            });
            this.drillingStatusSubscriber.subscribe(this.handleDrillingStatus);
            
            this.fsmStateSubscriber = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/drilling_fsm_state',
                messageType: 'std_msgs/String'
            });
            this.fsmStateSubscriber.subscribe(this.handleFsmState);

            this.roverStatusSubscriber = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/rover_status',
                messageType: 'roar_msgs/RoverStatus'
            });
            this.roverStatusSubscriber.subscribe(this.handleRoverStatus);
        }

        handleDrillingStatus = (message) => {
            const positiveHeight = Math.abs(message.current_height);
            if (this.platformDepthDisplay) {
                this.platformDepthDisplay.textContent = positiveHeight.toFixed(1);
            }
            if (this.sampleWeightDisplay) {
                this.sampleWeightDisplay.textContent = message.current_weight.toFixed(0);
            }
        }
        
        handleFsmState = (message) => {
            if (this.fsmStateDisplay) {
                this.fsmStateDisplay.textContent = message.data;
            }
        }

        handleRoverStatus = (message) => {
            this.currentRoverState = {
                rover_state: message.rover_state,
                active_mission: message.active_mission
            };
            console.log("Rover Status Received:", this.currentRoverState);
            this.updateManualControlUIState();
        }

        // New: Method to enable/disable manual control buttons and switches
        updateManualControlUIState = () => {
            const buttons = [
                this.platformUpButton, this.platformDownButton,
            ];
            const switches = [
                this.augerToggleSwitch, this.gateToggleSwitch
            ];
            const enableManualControls = this.currentRoverState.active_mission.toLowerCase() === 'teleoperation';

            buttons.forEach(button => {
                if (button) {
                    button.disabled = !enableManualControls;
                    if (enableManualControls) {
                        button.classList.remove('disabled-manual-control');
                    } else {
                        button.classList.add('disabled-manual-control');
                    }
                }
            });
            
            switches.forEach(sw => {
                if (sw) {
                    sw.disabled = !enableManualControls;
                    const parentContainer = sw.closest('.drilling-switch-container');
                    if (parentContainer) {
                         if (enableManualControls) {
                            parentContainer.classList.remove('disabled');
                        } else {
                            parentContainer.classList.add('disabled');
                        }
                    }
                }
            });

            const manualControlMessage = this.element.querySelector('.drilling-control-section p');
            if (manualControlMessage) {
                if (enableManualControls) {
                    manualControlMessage.textContent = 'These controls directly command the rig. They are active when the system is in "IDLE" state.';
                    manualControlMessage.style.color = '#666';
                } else {
                    manualControlMessage.textContent = `Manual controls are disabled outside of 'Teleoperation' mission. Current mission: ${this.currentRoverState.active_mission || 'None'}.`;
                    manualControlMessage.style.color = '#e74c3c';
                }
            }
        }

        updateRosStatus(isConnected, message = '') {
            if (isConnected) {
                this.rosConnected = true;
                if (this.rosStatusDot) {
                    this.rosStatusDot.classList.remove('error');
                    this.rosStatusDot.classList.add('connected');
                }
                if (this.rosStatus) {
                    this.rosStatus.textContent = 'Connected to ROS';
                    this.rosStatus.classList.remove('error');
                    this.rosStatus.classList.add('connected');
                }
            } else {
                this.rosConnected = false;
                if (this.rosStatusDot) {
                    this.rosStatusDot.classList.remove('connected');
                    this.rosStatusDot.classList.add('error');
                }
                if (this.rosStatus) {
                    this.rosStatus.textContent = message || 'Disconnected';
                    this.rosStatus.classList.remove('connected');
                    this.rosStatus.classList.add('error');
                }
            }
        }
        
        destroy() {
            console.log('Destroying DrillingControlView...');
            
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.removeEventListener('click', this.takeWebcamSnapshot);
                this.webcamSnapshotButton.removeEventListener('mousedown', this.handleSnapshotButtonMouseDown);
                this.webcamSnapshotButton.removeEventListener('mouseup', this.handleSnapshotButtonMouseUp);
                this.webcamSnapshotButton.removeEventListener('mouseleave', this.handleSnapshotButtonMouseLeave);
            }

            this.stopWebcam();

            if (this.drillingManualInputPublisher) {
                this.drillingManualInputPublisher.unadvertise();
            }
            if (this.drillingStatusSubscriber) {
                this.drillingStatusSubscriber.unsubscribe();
            }
            if (this.fsmStateSubscriber) {
                this.fsmStateSubscriber.unsubscribe();
            }
            if (this.roverStatusSubscriber) {
                this.roverStatusSubscriber.unsubscribe();
            }

            if (this.ros && this.ros.isConnected) {
                this.ros.off('connection', this.handleRosConnection);
                this.ros.off('error', this.handleRosError);
                this.ros.off('close', this.handleRosClose);
                this.ros.close();
            }

            if (this.openmct && this.openmct.editor) {
                this.openmct.editor.off('isEditing', this.handleEditModeChange);
            }
            
            this.platformUpButton = null;
            this.platformDownButton = null;
            this.augerToggleSwitch = null;
            this.gateToggleSwitch = null;
            this.webcamVideoElement = null;
            this.webcamMediaStream = null;
            this.webcamStatusMessageElement = null;
            this.webcamSnapshotButton = null;
            this.webcamInnerSnapshotCircle = null;
            this.rosStatusDot = null;
            this.rosStatus = null;
            this.fsmStateDisplay = null;
            this.platformDepthDisplay = null;
            this.sampleWeightDisplay = null;
            this.ros = null;
            this.openmct = null;
            this.currentRoverState = null;
            this.roverStatusSubscriber = null;

            this.element.innerHTML = '';
        }
    }

    window.DrillingControlView = DrillingControlView;

})();