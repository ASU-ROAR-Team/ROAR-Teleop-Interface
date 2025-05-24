/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2024, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

// Note: Ensure ROSLIB is loaded before this plugin (e.g., in index.html)
// ROSLIB will be available globally as 'ROSLIB'

window.StartComboPlugin = function StartComboPlugin() {
    let rosConnection = null;
    // ROS Publisher for teleop commands
    let teleopCommandPublisher = null;

    // Define the unique ID of your Tab View object.
    // This is the ID found in the URL parameter name, e.g., 'tabs.pos.<TabViewID>'
    // *** KEEP THIS UPDATED WITH THE CURRENT ID OF YOUR TAB VIEW OBJECT ***
    const TAB_VIEW_OBJECT_ID = '7f955c70-852d-4af2-9c6f-e47f0e5367f2'; // Your current Tab View ID

    // Define the 0-based index of the Navigation tab within your Tab View.
    // This tab will now handle Start, Stop, Reset, Automatic, Manual, and Teleop buttons.
    // *** KEEP THIS UPDATED WITH THE CURRENT INDEX OF YOUR NAVIGATION TAB ***
    const NAVIGATION_TAB_INDEX = 0; // Your current Navigation Tab Index

    // You will define indices for other tabs here later, e.g.:
    // const MAINTENANCE_TAB_INDEX = 0; // Example index
    // const PLOTTING_TAB_INDEX = 1;    // Example index
    // const SAMPLING_TAB_INDEX = 2;    // Based on your URL


    return function install(openmct) {
        // Ensure these IDs match the keys of your Start/Stop/Reset/Automatic/Manual Condition Widgets and Timer object
        const START_CONDITION_ID = '1a569409-1887-4d0b-a666-e95f315f121e';
        const STOP_CONDITION_ID = 'c3dcf803-db9c-4bea-8cf5-42757073aaa9';
        const TIMER_ID = 'aeedce2a-e698-4421-a6b4-6caa5f9cd53b';
        const RESET_CONDITION_ID = 'a3c8bcf6-f105-4f5e-9ea8-56f6cb53cadc'; // Placeholder

        // Define the IDs for your Automatic and Manual Condition Widgets
        // You will get these IDs after creating the Automatic and Manual buttons in Open MCT
        const AUTOMATIC_CONDITION_ID = '0864bbd3-d1c0-4788-bd64-bb69dc67b20e'; // <-- *** REPLACE THIS with your Automatic Button ID ***
        const MANUAL_CONDITION_ID = '1960c2d2-c001-4d0a-9248-657b0c5c4d93'; // <-- *** REPLACE THIS with your Manual Button ID ***

        // *** NEW: Define the IDs for your Teleoperation Arrow Buttons and a Stop Button ***
        // These IDs have been updated based on your input.
        const TELEOP_FORWARD_ID = '4869247c-071e-4758-af09-4c392f91157c';
        const TELEOP_BACKWARD_ID = '8d37b37c-f119-4c84-9cdd-ee5ab8085fd9';
        const TELEOP_LEFT_ID = 'da097b62-92ea-4226-97e6-13e7a7d01753';
        const TELEOP_RIGHT_ID = 'e9521249-b137-4fed-bc12-5e825d721d2f';
        // Note: A dedicated Stop button is highly recommended for safety with push-button teleop.
        // If you don't have one, releasing *any* teleop button will send 'stop'.
        const TELEOP_STOP_ID = 'your-teleop-stop-button-id'; // <-- *** REPLACE THIS (Optional if you don't have a dedicated stop button) ***


        try {
            if (typeof ROSLIB === 'undefined' || typeof ROSLIB.Ros === 'undefined') {
                 console.error('StartComboPlugin: ROSLIB library not available.');
            } else {
                // Check if a global ROS connection already exists (e.g., from another plugin)
                if (typeof window.ros !== 'undefined' && window.ros.isConnected) {
                    rosConnection = window.ros;
                    console.log('StartComboPlugin: Using existing ROS connection.');
                     // If using existing connection, initialize publisher here
                     teleopCommandPublisher = new ROSLIB.Topic({
                         ros: rosConnection,
                         name: '/teleop_command',
                         messageType: 'std_msgs/String'
                     });
                     console.log("StartComboPlugin: Initialized teleop command publisher using existing connection.");

                } else {
                    // Otherwise, create a new connection
                    rosConnection = new ROSLIB.Ros({
                        url: 'ws://localhost:9090' // Match your rosbridge_websocket URL
                    });
                    rosConnection.on('connection', () => {
                        console.log('StartComboPlugin: ROS Connected.');
                        // Initialize publisher once connected
                        teleopCommandPublisher = new ROSLIB.Topic({
                            ros: rosConnection,
                            name: '/teleop_command',
                            messageType: 'std_msgs/String'
                        });
                        console.log("StartComboPlugin: Initialized teleop command publisher.");
                    });
                    rosConnection.on('error', (err) => { console.error('StartComboPlugin: ROS Connection error:', err); });
                    rosConnection.on('close', () => {
                        console.warn('StartComboPlugin: ROS Connection closed.');
                        // Clean up publisher on close
                        teleopCommandPublisher = null;
                    });
                }
            }
        } catch (error) {
            console.error('StartComboPlugin: Error during ROS connection attempt:', error);
            rosConnection = null;
            teleopCommandPublisher = null;
        }

        openmct.objectViews.addProvider({
            key: 'control-button-view', // Renamed key for clarity
            name: 'Control Button View', // Updated name
            canView: (domainObject) => {
                 // Include all relevant button IDs in canView
                 return (domainObject.identifier.key === START_CONDITION_ID ||
                         domainObject.identifier.key === STOP_CONDITION_ID ||
                         domainObject.identifier.key === RESET_CONDITION_ID ||
                         domainObject.identifier.key === AUTOMATIC_CONDITION_ID ||
                         domainObject.identifier.key === MANUAL_CONDITION_ID ||
                         // Include Teleop Button IDs
                         domainObject.identifier.key === TELEOP_FORWARD_ID ||
                         domainObject.identifier.key === TELEOP_BACKWARD_ID ||
                         domainObject.identifier.key === TELEOP_LEFT_ID ||
                         domainObject.identifier.key === TELEOP_RIGHT_ID ||
                         domainObject.identifier.key === TELEOP_STOP_ID) &&
                        domainObject.type === 'conditionWidget';
            },
            view: (domainObject, objectPath) => {
                let childView;
                // Use separate listeners for supervisor/mode buttons and teleop buttons
                let supervisorClickListener;
                let teleopMousedownListener;
                let teleopMouseupListener;
                let currentContainer;
                const capturedOpenmctForView = openmct;

                return {
                    show: (container) => {
                        currentContainer = container;
                        const providers = capturedOpenmctForView.objectViews.get(domainObject, objectPath)
                            .filter(p => p.key !== 'control-button-view'); // Updated key

                        if (!providers.length) {
                            console.warn('StartComboPlugin: No default view found.');
                            currentContainer.innerHTML = 'No default view available.';
                            return;
                        }

                        childView = providers[0].view(domainObject, objectPath);
                        childView.show(currentContainer);

                        // Determine the type of button and its associated command(s)
                        let isSupervisorButton = false;
                        let isTeleopButton = false;
                        let supervisorCommand = null; // Command for the supervisor service
                        let teleopCommandOnPress = null; // Command for teleop node on mousedown
                        let teleopCommandOnRelease = null; // Command for teleop node on mouseup (usually 'stop')
                        let timerActionKey = null; // Timer action

                        // *** Determine button type and commands based on ID ***
                        if (domainObject.identifier.key === START_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "start";
                            timerActionKey = 'timer.start';
                        } else if (domainObject.identifier.key === STOP_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "stop";
                            timerActionKey = 'timer.pause';
                        } else if (domainObject.identifier.key === RESET_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "reset";
                            timerActionKey = 'timer.stop';
                        } else if (domainObject.identifier.key === AUTOMATIC_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "automatic";
                            timerActionKey = null; // No timer action for mode switch
                        } else if (domainObject.identifier.key === MANUAL_CONDITION_ID) {
                            isSupervisorButton = true;
                            supervisorCommand = "manual";
                            timerActionKey = null; // No timer action for mode switch
                        }
                        // Handle Teleop Button Clicks - Set teleop commands
                        else if (domainObject.identifier.key === TELEOP_FORWARD_ID) {
                            isTeleopButton = true;
                            teleopCommandOnPress = "forward";
                            teleopCommandOnRelease = "stop"; // Send stop on release
                        } else if (domainObject.identifier.key === TELEOP_BACKWARD_ID) {
                            isTeleopButton = true;
                            teleopCommandOnPress = "backward";
                            teleopCommandOnRelease = "stop"; // Send stop on release
                        } else if (domainObject.identifier.key === TELEOP_LEFT_ID) {
                            isTeleopButton = true;
                            teleopCommandOnPress = "left"; // Send 'left' for left turn
                            teleopCommandOnRelease = "stop"; // Send stop on release
                        } else if (domainObject.identifier.key === TELEOP_RIGHT_ID) {
                            isTeleopButton = true;
                            teleopCommandOnPress = "right"; // Send 'right' for right turn
                            teleopCommandOnRelease = "stop"; // Send stop on release
                        } else if (domainObject.identifier.key === TELEOP_STOP_ID) {
                            isTeleopButton = true;
                            teleopCommandOnPress = "stop"; // Dedicated stop button sends stop on press
                            teleopCommandOnRelease = "stop"; // And stop on release (redundant but safe)
                        }
                        // *** END Determine button type and commands ***


                        // --- Define Listener Functions ---

                        // Listener for Supervisor/Mode buttons (uses click event)
                        if (isSupervisorButton) {
                            supervisorClickListener = async () => {
                                console.log(`StartComboPlugin: Supervisor Button clicked: ${domainObject.identifier.key}, Command: ${supervisorCommand}`);

                                // Check the active tab index
                                let activeTabIndex = null;
                                const params = capturedOpenmctForView.router.currentLocation.params;
                                const tabParamName = `tabs.pos.${TAB_VIEW_OBJECT_ID}`;
                                if (params && params[tabParamName]) {
                                    activeTabIndex = parseInt(params[tabParamName], 10);
                                }

                                // Only act if on the correct tab
                                if (activeTabIndex === NAVIGATION_TAB_INDEX) {
                                    console.log('StartComboPlugin: Navigation tab is active. Triggering supervisor/mode actions.');

                                    // Handle commands for the Supervisor service (Start, Stop, Reset, Automatic, Manual)
                                    // These commands are sent via service call
                                    if (supervisorCommand && rosConnection && rosConnection.isConnected) {
                                        try {
                                            const launchService = new ROSLIB.Service({
                                                ros: rosConnection,
                                                name: '/LaunchAPF',
                                                serviceType: 'apf_trials/LaunchAPF'
                                            });
                                            const request = new ROSLIB.ServiceRequest({ command: supervisorCommand });
                                            launchService.callService(request, (result) => {
                                                if (result.success) { console.log(`StartComboPlugin: ROS service call success for "${supervisorCommand}".`); }
                                                else { console.error(`StartComboPlugin: ROS service call failed for "${supervisorCommand}".`); }
                                            }, (error) => { console.error(`StartComboPlugin: ROS service call error for "${supervisorCommand}":`, error); error });
                                        } catch (error) { console.error('StartComboPlugin: Error calling ROS service:', error); }
                                    } else if (supervisorCommand) {
                                        console.warn(`StartComboPlugin: ROS connection not ready or command is null. Supervisor command "${supervisorCommand}" not sent.`);
                                    }

                                    // Handle timer actions (only for Start, Stop, Reset)
                                    if (timerActionKey && (supervisorCommand === "start" || supervisorCommand === "stop" || supervisorCommand === "reset")) {
                                        try {
                                            const timerObject = await capturedOpenmctForView.objects.get(TIMER_ID);
                                             if (timerObject && capturedOpenmctForView.actions && capturedOpenmctForView.actions._allActions) {
                                                 const timerAction = capturedOpenmctForView.actions._allActions[timerActionKey];
                                                 if (timerAction && typeof timerAction.invoke === 'function') {
                                                      const isApplicable = typeof timerAction.appliesTo === 'function' ? timerAction.appliesTo([timerObject]) : true;
                                                      if (isApplicable) {
                                                           await timerAction.invoke([timerObject]);
                                                           console.log(`StartComboPlugin: Timer action invoked: ${timerActionKey}.`);
                                                      } else {
                                                           console.log(`StartComboPlugin: Timer action not applicable: ${timerActionKey}.`);
                                                      }
                                                 } else { console.error(`StartComboPlugin: Timer action not found: ${timerActionKey}.`); }
                                              } else { console.error('StartComboPlugin: Timer object or actions not available.'); }
                                         } catch (error) { console.error(`StartComboPlugin: Error triggering timer action ${timerActionKey}:`, error); error }
                                     }

                                } else {
                                    console.log(`StartComboPlugin: Supervisor button click ignored: Not on Navigation tab (${activeTabIndex}).`);
                                }
                            };
                        }


                        // Listener for Teleop buttons (uses mousedown and mouseup events)
                        if (isTeleopButton) {
                            teleopMousedownListener = () => {
                                console.log(`StartComboPlugin: Teleop Button mousedown: ${domainObject.identifier.key}, Command: ${teleopCommandOnPress}`);

                                // Check the active tab index
                                let activeTabIndex = null;
                                const params = capturedOpenmctForView.router.currentLocation.params;
                                const tabParamName = `tabs.pos.${TAB_VIEW_OBJECT_ID}`;
                                if (params && params[tabParamName]) {
                                    activeTabIndex = parseInt(params[tabParamName], 10);
                                }

                                // Only send teleop command if on the correct tab
                                if (activeTabIndex === NAVIGATION_TAB_INDEX) {
                                     if (teleopCommandOnPress && teleopCommandPublisher) {
                                          try {
                                              const message = new ROSLIB.Message({ data: teleopCommandOnPress });
                                              teleopCommandPublisher.publish(message);
                                              console.log(`StartComboPlugin: Published teleop command on mousedown: "${teleopCommandOnPress}" to /teleop_command.`);
                                          } catch (error) { console.error(`StartComboPlugin: Error publishing teleop command "${teleopCommandOnPress}" on mousedown:`, error); }
                                     } else if (teleopCommandOnPress) {
                                          console.warn(`StartComboPlugin: Teleop command publisher not ready or command is null. Teleop command "${teleopCommandOnPress}" not sent on mousedown.`);
                                     }
                                } else {
                                     console.log(`StartComboPlugin: Teleop button mousedown ignored: Not on Navigation tab (${activeTabIndex}).`);
                                }
                            };

                            teleopMouseupListener = () => {
                                console.log(`StartComboPlugin: Teleop Button mouseup: ${domainObject.identifier.key}, Command: ${teleopCommandOnRelease}`);

                                // Check the active tab index
                                let activeTabIndex = null;
                                const params = capturedOpenmctForView.router.currentLocation.params;
                                const tabParamName = `tabs.pos.${TAB_VIEW_OBJECT_ID}`;
                                if (params && params[tabParamName]) {
                                    activeTabIndex = parseInt(params[tabParamName], 10);
                                }

                                // Only send teleop command if on the correct tab
                                if (activeTabIndex === NAVIGATION_TAB_INDEX) {
                                     // Always send the stop command on mouseup for teleop buttons
                                     if (teleopCommandOnRelease && teleopCommandPublisher) {
                                          try {
                                              const message = new ROSLIB.Message({ data: teleopCommandOnRelease });
                                              teleopCommandPublisher.publish(message);
                                              console.log(`StartComboPlugin: Published teleop command on mouseup: "${teleopCommandOnRelease}" to /teleop_command.`);
                                          } catch (error) { console.error(`StartComboPlugin: Error publishing teleop command "${teleopCommandOnRelease}" on mouseup:`, error); error }
                                     } else if (teleopCommandOnRelease) {
                                          console.warn(`StartComboPlugin: Teleop command publisher not ready or command is null. Teleop command "${teleopCommandOnRelease}" not sent on mouseup.`);
                                     }
                                } else {
                                     console.log(`StartComboPlugin: Teleop button mouseup ignored: Not on Navigation tab (${activeTabIndex}).`);
                                }
                            };
                        }
                        // --- End Define Listener Functions ---


                        // --- Add Event Listeners ---
                        currentContainer.style.cursor = 'pointer'; // Indicate it's clickable

                        if (isSupervisorButton && supervisorClickListener) {
                            // Use click for supervisor/mode buttons
                            currentContainer.addEventListener('click', supervisorClickListener);
                        } else if (isTeleopButton && teleopMousedownListener && teleopMouseupListener) {
                            // Use mousedown and mouseup for teleop buttons
                            currentContainer.addEventListener('mousedown', teleopMousedownListener);
                            currentContainer.addEventListener('mouseup', teleopMouseupListener);
                            // Also listen for mouseleave in case the user drags off the button before releasing
                            currentContainer.addEventListener('mouseleave', teleopMouseupListener); // Treat mouseleave as mouseup
                            // Prevent default drag behavior on some browsers
                            currentContainer.addEventListener('dragstart', (event) => { event.preventDefault(); });
                        }


                    },
                    destroy: () => {
                        // Clean up the event listeners and child view when the view is destroyed
                        if (currentContainer) {
                            if (supervisorClickListener) {
                                currentContainer.removeEventListener('click', supervisorClickListener);
                            }
                            if (teleopMousedownListener) {
                                currentContainer.removeEventListener('mousedown', teleopMousedownListener);
                            }
                            if (teleopMouseupListener) {
                                currentContainer.removeEventListener('mouseup', teleopMouseupListener);
                                currentContainer.removeEventListener('mouseleave', teleopMouseupListener);
                                currentContainer.removeEventListener('dragstart', (event) => { event.preventDefault(); });
                            }
                            currentContainer.style.cursor = '';
                        }
                        childView?.destroy?.();
                        currentContainer = null;
                        supervisorClickListener = null;
                        teleopMousedownListener = null;
                        teleopMouseupListener = null;
                        childView = null;
                         // The ROS connection and publisher are handled globally or by the main plugin destroy.
                    }
                };
            }
        });

        // Main plugin destroy function
        return {
             destroy: () => {
                 // If this plugin created the ROS connection, close it here.
                 // Check if window.ros exists and is the same instance as rosConnection
                 if (rosConnection && rosConnection.isConnected && (typeof window.ros === 'undefined' || window.ros !== rosConnection)) {
                      console.log('StartComboPlugin: Closing ROS connection.');
                     try { rosConnection.close(); } catch (error) { console.error('StartComboPlugin: Error closing ROS connection:', error); error }
                 } else if (rosConnection && (typeof window.ros === 'undefined' || window.ros !== rosConnection)) {
                     console.log('StartComboPlugin: ROS connection not connected, cleaning up.');
                     try { rosConnection = null; } catch (error) { console.error('StartComboPlugin: Error during cleanup:', error); error }
                 }
                 // The teleopCommandPublisher will be cleaned up when the connection closes
                 teleopCommandPublisher = null;
             }
        };
    };
}
