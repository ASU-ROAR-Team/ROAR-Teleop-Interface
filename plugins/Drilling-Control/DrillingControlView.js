// src/plugins/Drilling-Control/DrillingControlView.js

(function () {
    class DrillingControlView {
        constructor(element, openmct) {
            this.element = element;
            this.openmct = openmct;
            this.ros = null;
            this.rosConnected = false;
            this.drillingCommandPublisher = null;
            this.drillingStatusSubscriber = null;
            this.fsmStateSubscriber = null;
            this.rosStatusDot = null;
            this.rosStatus = null;
            this.fsmStateDisplay = null;
            this.platformDepthDisplay = null;
            this.sampleWeightDisplay = null;
            this.startAutoButton = null;
            this.stopSequenceButton = null;
            this.platformUpButton = null;
            this.platformDownButton = null;
            this.augerOnButton = null;
            this.augerOffButton = null;
            this.gateOpenButton = null;
            this.gateCloseButton = null;
            this.currentManualState = {
                targetHeightCm: 0.0,
                augerOn: false,
                gateOpen: false,
                manualUp: false,
                manualDown: false
            };

            // Webcam related properties
            this.webcamVideoElement = null;
            this.webcamMediaStream = null;
            this.webcamStatusMessageElement = null;
            this.webcamSnapshotButton = null;

            // Bind methods to ensure 'this' context is correct
            this.handleRosConnection = this.handleRosConnection.bind(this);
            this.handleRosError = this.handleRosError.bind(this);
            this.handleRosClose = this.handleRosClose.bind(this);
            this.handleDrillingStatus = this.handleDrillingStatus.bind(this);
            this.handleFsmState = this.handleFsmState.bind(this);
            this.handleManualButtonClick = this.handleManualButtonClick.bind(this);
            this.handleEditModeChange = this.handleEditModeChange.bind(this);
            this.takeWebcamSnapshot = this.takeWebcamSnapshot.bind(this);
            this.startDrillingService = this.startDrillingService.bind(this); 
            this.stopDrillingService = this.stopDrillingService.bind(this); 
        }

        render() {
            // Load the HTML content for the drilling control view
            fetch('./plugins/Drilling-Control/DrillingControlView.html')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.text();
                })
                .then(html => {
                    this.element.innerHTML = html;
                    this.initializeUI();
                    this.connectToROS();
                    this.startWebcam(); // Start webcam after UI is initialized
                    this.openmct.editor.on('isEditing', this.handleEditModeChange); // Listen for edit mode changes
                })
                .catch(error => {
                    console.error('Error loading DrillingControlView.html:', error);
                    this.element.innerHTML = `<p style="color: red;">Error loading drilling control UI.</p>`;
                });
        }

        initializeUI() {
            this.rosStatusDot = this.element.querySelector('#rosStatusDot');
            this.rosStatus = this.element.querySelector('#rosStatus');
            this.fsmStateDisplay = this.element.querySelector('#fsmState');
            this.platformDepthDisplay = this.element.querySelector('#platformDepth');
            this.sampleWeightDisplay = this.element.querySelector('#sampleWeight');
            this.startAutoButton = this.element.querySelector('#startAutoButton');
            this.stopSequenceButton = this.element.querySelector('#stopSequenceButton');
            this.platformUpButton = this.element.querySelector('#platformUpButton');
            this.platformDownButton = this.element.querySelector('#platformDownButton');
            this.augerOnButton = this.element.querySelector('#augerOnButton');
            this.augerOffButton = this.element.querySelector('#augerOffButton');
            this.gateOpenButton = this.element.querySelector('#gateOpenButton');
            this.gateCloseButton = this.element.querySelector('#gateCloseButton');

            // Initialize webcam UI elements
            this.webcamVideoElement = this.element.querySelector('#webcamVideo');
            this.webcamStatusMessageElement = this.element.querySelector('#webcamStatusMessage');
            this.webcamSnapshotButton = this.element.querySelector('#snapshotButton');

            this.addEventListeners();
        }

        addEventListeners() {
            // "Start Automatic" and "Stop & Manual" buttons
            this.startAutoButton.addEventListener('click', this.startDrillingService);
            this.stopSequenceButton.addEventListener('click', this.stopDrillingService);

            // Platform Up/Down: Momentary buttons (hold to activate)
            const addMomentaryListener = (button, command) => {
                if (button) {
                    button.addEventListener('mousedown', () => this.handleManualButtonClick(command, true));
                    button.addEventListener('mouseup', () => this.handleManualButtonClick(command, false));
                    button.addEventListener('mouseleave', () => this.handleManualButtonClick(command, false));
                }
            };
            addMomentaryListener(this.platformUpButton, 'manualUp');
            addMomentaryListener(this.platformDownButton, 'manualDown');

            // Auger and Gate: Toggle buttons (click to activate/deactivate)
            const addClickListener = (button, command, value) => {
                if (button) {
                    button.addEventListener('click', () => this.handleManualButtonClick(command, value));
                }
            };
            addClickListener(this.augerOnButton, 'auger', true);
            addClickListener(this.augerOffButton, 'auger', false);
            addClickListener(this.gateOpenButton, 'gate', true);
            addClickListener(this.gateCloseButton, 'gate', false);

            // Add webcam snapshot button listener
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.addEventListener('click', this.takeWebcamSnapshot);
                // Add active state for click effect (outer circle press)
                this.webcamSnapshotButton.addEventListener('mousedown', () => {
                    this.webcamSnapshotButton.style.transform = 'translateX(-50%) scale(0.95)';
                    this.webcamSnapshotButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                });
                this.webcamSnapshotButton.addEventListener('mouseup', () => {
                    this.webcamSnapshotButton.style.transform = 'translateX(-50%) scale(1)';
                    this.webcamSnapshotButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
                });
                this.webcamSnapshotButton.addEventListener('mouseleave', () => {
                    // Reset if mouse leaves while held down
                    this.webcamSnapshotButton.style.transform = 'translateX(-50%) scale(1)';
                    this.webcamSnapshotButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
                });
            }
        }
        
        sendDrillingCommand(command) {
            if (!this.rosConnected || !this.drillingCommandPublisher) {
                console.warn('ROS is not connected or publisher is not initialized. Command not sent.');
                return;
            }

            const drillingMessage = new ROSLIB.Message({
                target_height_cm: command.targetHeightCm,
                gate_open: command.gateOpen,
                auger_on: command.augerOn,
                manual_up: command.manualUp,
                manual_down: command.manualDown
            });

            this.drillingCommandPublisher.publish(drillingMessage);
            console.log("Published Drilling Command:", drillingMessage);
        }

        handleManualButtonClick(commandType, value) {
            // Reset manualUp and manualDown for momentary control
            this.currentManualState.manualUp = false;
            this.currentManualState.manualDown = false;
            
            if (commandType === 'manualUp') {
                this.currentManualState.manualUp = value; // value is true/false based on mousedown/mouseup
            } else if (commandType === 'manualDown') {
                this.currentManualState.manualDown = value; // value is true/false based on mousedown/mouseup
            } else if (commandType === 'auger') {
                this.currentManualState.augerOn = value; // value is true for AugerOn, false for AugerOff
            } else if (commandType === 'gate') {
                this.currentManualState.gateOpen = value; // value is true for GateOpen, false for GateClose
            }
            
            this.sendDrillingCommand(this.currentManualState);
        }

        startDrillingService() { 
            if (!this.rosConnected) {
                console.warn('ROS is not connected. Cannot start drilling service.');
                return;
            }
            const startService = new ROSLIB.Service({
                ros: this.ros,
                name: '/start_module',
                serviceType: 'roar_msgs/StartModule'
            });
            const request = new ROSLIB.ServiceRequest({});

            startService.callService(request, (result) => {
                if (result.success) {
                    console.log('Drilling sequence started successfully via service call.');
                } else {
                    console.error('Failed to start drilling sequence:', result.message);
                }
            }, (error) => {
                console.error('Error calling start_module service:', error);
            });
        }
        
        // Calls the new /stop_module ROS service (std_srvs/Trigger)
        stopDrillingService() { 
             if (!this.rosConnected) {
                console.warn('ROS is not connected. Cannot stop drilling service.');
                return;
            }
            const stopService = new ROSLIB.Service({
                ros: this.ros,
                name: '/stop_module', // New service name
                messageType: 'std_srvs/Trigger' // Service type for simple trigger
            });
            const request = new ROSLIB.ServiceRequest({});

            stopService.callService(request, (result) => {
                if (result.success) {
                    console.log('Drilling sequence stop request sent successfully.');
                } else {
                    console.error('Failed to send stop drilling sequence request:', result.message);
                }
            }, (error) => {
                console.error('Error calling /stop_module service:', error);
            });
        }

        connectToROS() {
            if (typeof window.ROSLIB === 'undefined') {
                console.error("ROSLIB is not defined. Ensure ros-lib.js is loaded.");
                this.updateRosStatus(false);
                return;
            }

            this.ros = new window.ROSLIB.Ros({ url: 'ws://localhost:9090' });
            this.ros.on('connection', this.handleRosConnection);
            this.ros.on('error', this.handleRosError);
            this.ros.on('close', this.handleRosClose);
        }

        handleRosConnection() {
            console.log('Connected to ROS websocket server.');
            this.updateRosStatus(true);
            this.drillingCommandPublisher = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/drilling_command',
                messageType: 'roar_msgs/DrillingCommand' // <--- Changed here!
            });

            this.drillingStatusSubscriber = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/drilling_status',
                messageType: 'roar_msgs/DrillingStatus'
            });
            this.drillingStatusSubscriber.subscribe(this.handleDrillingStatus);
            
            this.fsmStateSubscriber = new window.ROSLIB.Topic({
                ros: this.ros,
                name: '/drilling_fsm_state',
                messageType: 'std_msgs/String'
            });
            this.fsmStateSubscriber.subscribe(this.handleFsmState);
        }

        handleRosError(error) {
            console.error('ROS connection error:', error);
            this.updateRosStatus(false, 'ROS Connection Error!');
        }

        handleRosClose() {
            console.warn('ROS connection closed. Attempting to reconnect...');
            this.updateRosStatus(false);
            if (this.drillingStatusSubscriber) {
                this.drillingStatusSubscriber.unsubscribe();
            }
            if (this.fsmStateSubscriber) {
                this.fsmStateSubscriber.unsubscribe();
            }
            setTimeout(() => {
                this.connectToROS();
            }, 3000); // Attempt to reconnect after 3 seconds
        }
        
        handleDrillingStatus(message) {
            // Display absolute height for user readability (platform depth is usually positive)
            const positiveHeight = Math.abs(message.current_height);
            this.platformDepthDisplay.textContent = positiveHeight.toFixed(1);
            this.sampleWeightDisplay.textContent = message.current_weight.toFixed(0);
        }
        
        handleFsmState(message) {
            this.fsmStateDisplay.textContent = message.data; // Update FSM state display
        }

        updateRosStatus(isConnected, message = '') {
            if (isConnected) {
                this.rosConnected = true;
                this.rosStatusDot.classList.remove('error');
                this.rosStatusDot.classList.add('connected');
                this.rosStatus.textContent = 'Connected to ROS';
            } else {
                this.rosConnected = false;
                this.rosStatusDot.classList.remove('connected');
                this.rosStatusDot.classList.add('error');
                this.rosStatus.textContent = message || 'Disconnected';
            }
        }

        // --- Webcam Methods ---

        displayWebcamStatus(message, type = 'info') {
            if (this.webcamStatusMessageElement) {
                this.webcamStatusMessageElement.textContent = message;
                this.webcamStatusMessageElement.className = 'webcam-status-message ' + type;
                this.webcamStatusMessageElement.style.display = 'block'; // Ensure it's visible
            }
        }

        hideWebcamStatus() {
            if (this.webcamStatusMessageElement) {
                this.webcamStatusMessageElement.style.display = 'none';
            }
        }

        async startWebcam() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.displayWebcamStatus('Webcam not supported by this browser.', 'error');
                console.error('Webcam not supported by this browser.');
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
                    this.webcamSnapshotButton.style.display = 'flex'; // Make button visible (flex for centering inner circle)
                }
                console.log('Webcam stream started.');
            } catch (err) {
                this.displayWebcamStatus('Failed to access webcam. Ensure it\'s connected and permissions are granted.', 'error');
                console.error('Error accessing webcam:', err);
                this.webcamVideoElement.style.display = 'none';
                if (this.webcamSnapshotButton) {
                    this.webcamSnapshotButton.style.display = 'none';
                }
            }
        }

        stopWebcam() {
            if (this.webcamMediaStream) {
                this.webcamMediaStream.getTracks().forEach(track => track.stop());
                this.webcamMediaStream = null;
                this.webcamVideoElement.srcObject = null;
                console.log('Webcam stream stopped.');
            }
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.style.display = 'none';
            }
        }

        takeWebcamSnapshot() {
            if (!this.webcamVideoElement || this.webcamVideoElement.paused || this.webcamVideoElement.ended || this.webcamVideoElement.readyState < this.webcamVideoElement.HAVE_CURRENT_DATA) {
                console.warn('Cannot take snapshot: Video stream not ready.');
                this.openmct.notifications.error('Snapshot failed: Video stream not ready.');
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = this.webcamVideoElement.videoWidth;
            canvas.height = this.webcamVideoElement.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(this.webcamVideoElement, 0, 0, canvas.width, canvas.height);

            const imageDataUrl = canvas.toDataURL('image/png');

            // Create a temporary link element to trigger the download
            const link = document.createElement('a');
            link.href = imageDataUrl;
            link.download = `webcam-snapshot-${Date.now()}.png`; // Suggested filename
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log('Snapshot captured and download initiated.');

            this.openmct.notifications.info('Snapshot captured successfully!');
        }

        handleEditModeChange(isEditing) {
            if (isEditing) {
                this.stopWebcam();
                this.displayWebcamStatus('Webcam: In edit mode. Stream paused.', 'info');
            } else {
                this.startWebcam();
            }
        }

        destroy() {
            // Clean up ROS subscribers and connection
            if (this.drillingStatusSubscriber) {
                this.drillingStatusSubscriber.unsubscribe();
            }
            if (this.fsmStateSubscriber) {
                this.fsmStateSubscriber.unsubscribe();
            }
            if (this.ros && this.ros.isConnected) {
                this.ros.close();
            }

            // Clean up webcam resources
            this.stopWebcam();
            if (this.webcamSnapshotButton) {
                this.webcamSnapshotButton.removeEventListener('click', this.takeWebcamSnapshot);
                this.webcamSnapshotButton.removeEventListener('mousedown', () => {}); // Remove anonymous functions
                this.webcamSnapshotButton.removeEventListener('mouseup', () => {});   // This requires named functions or
                this.webcamSnapshotButton.removeEventListener('mouseleave', () => {});// careful management if kept anonymous.
            }
            this.openmct.editor.off('isEditing', this.handleEditModeChange); // Remove editor listener

            this.element.innerHTML = ''; // Clear the DOM element
        }
    }

    window.DrillingControlView = DrillingControlView;
})();
