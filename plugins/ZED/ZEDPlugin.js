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

// Define the key for your new object type
const ZED_CAMERA_KEY = 'zed-camera';

// Define the plugin factory function
window.ZEDPlugin = function ZEDPlugin() {
    return function install(openmct) {
        // --- Define the new object type ---
        openmct.types.addType(ZED_CAMERA_KEY, {
            name: 'ZED Camera',
            description: 'Displays a video feed from a ZED 2 camera ROS topic via rosbridge_server and roslibjs.',
            creatable: true,
            cssClass: 'icon-camera', // Using a camera icon
            initialize(domainObject) {
                // Initialize properties for the object
                domainObject.rosbridgeUrl = 'ws://localhost:9090'; // Default rosbridge URL
                // Set default topic to the final compressed output from the ROS pipeline
                domainObject.rosImageTopic = '/zed2i/zed_node/depth/depth_registered/color_mapped_image/compressed_for_web'; // This must match the Python script's output topic                domainObject.throttleRate = 100; // Default throttle rate in ms (e.g., 100ms for 10Hz)
            },
            form: [
                {
                    key: 'rosbridgeUrl',
                    name: 'ROSBridge WebSocket URL',
                    control: 'textfield',
                    required: true,
                    cssClass: 'l-input',
                    // Example: ws://localhost:9090 or ws://<robot_ip>:9090
                },
                {
                    key: 'rosImageTopic',
                    name: 'ROS Image Topic Name',
                    control: 'textfield',
                    required: true,
                    cssClass: 'l-input',
                    // Example: /zed2i/zed_node/depth/depth_registered/color_mapped_image/compressed
                },
                {
                    key: 'throttleRate',
                    name: 'Throttle Rate (ms)',
                    control: 'numberfield',
                    required: false,
                    cssClass: 'l-input',
                    // Optional: Minimum time (ms) between messages sent from rosbridge.
                    // Helps manage bandwidth and client-side load.
                    // 100ms = 10Hz, 33ms = ~30Hz
                }
            ]
        });
        // --- End Define new object type ---

        // --- Define the view provider for the new object type ---
        openmct.objectViews.addProvider({
            key: 'zed-camera-view',
            name: 'ZED Camera View',
            canView: (domainObject) => {
                return domainObject.type === ZED_CAMERA_KEY;
            },
            view: (domainObject) => {
                let imgElement = null;
                let ros = null; // ROSLIB.Ros client instance
                let imageTopicSubscriber = null; // ROSLIB.Topic subscriber instance
                let errorMessageElement = null;
                let currentObjectURL = null; // To keep track of the current object URL for revoking
                let viewContainerElement = null; // Store the element passed to show

                // displayMessage function now uses viewContainerElement
                const displayMessage = (message, type = 'info') => {
                    // Clear previous messages
                    if (errorMessageElement && errorMessageElement.parentElement) {
                        errorMessageElement.parentElement.removeChild(errorMessageElement);
                        errorMessageElement = null;
                    }
                    // Hide image if message is an error/warning
                    if (imgElement) {
                        imgElement.style.display = (type === 'error' || type === 'warning') ? 'none' : 'block';
                    }

                    errorMessageElement = document.createElement('div');
                    errorMessageElement.style.textAlign = 'center';
                    errorMessageElement.style.marginTop = '20px';
                    errorMessageElement.style.padding = '10px';
                    errorMessageElement.style.borderRadius = '5px';
                    if (type === 'error') {
                        errorMessageElement.style.color = 'white';
                        errorMessageElement.style.backgroundColor = '#d9534f'; // Red
                    } else if (type === 'warning') {
                        errorMessageElement.style.color = 'black';
                        errorMessageElement.style.backgroundColor = '#f0ad4e'; // Orange
                    } else {
                        errorMessageElement.style.color = 'black';
                        errorMessageElement.style.backgroundColor = '#d9edf7'; // Blue
                    }
                    errorMessageElement.textContent = message;

                    // Use the stored viewContainerElement (passed to show)
                    if (viewContainerElement) {
                        viewContainerElement.appendChild(errorMessageElement);
                    } else {
                        // Fallback to document.body, but this should ideally not be reached if show was called
                        console.error('ZED Plugin: Cannot find view container element, appending message to body as fallback.');
                        document.body.appendChild(errorMessageElement);
                    }
                };

                const connectAndSubscribe = (rosbridgeUrl, rosImageTopic, throttleRate) => {
                    // Clean up existing connections if any
                    if (imageTopicSubscriber) {
                        imageTopicSubscriber.unsubscribe();
                        imageTopicSubscriber = null;
                    }
                    if (ros) {
                        ros.close();
                        ros = null;
                    }
                    if (currentObjectURL) {
                        URL.revokeObjectURL(currentObjectURL);
                        currentObjectURL = null;
                    }
                    if (imgElement) {
                        imgElement.src = ''; // Clear current image
                        imgElement.style.display = 'none'; // Hide again
                    }

                    if (!rosbridgeUrl || !rosImageTopic) {
                        displayMessage('ZED Camera: ROSBridge URL or Image Topic not configured.', 'warning');
                        return;
                    }

                    console.log(`ZED Plugin: Attempting to connect to ROSBridge at: ${rosbridgeUrl}`);
                    console.log(`ZED Plugin: Subscribing to image topic: ${rosImageTopic}`);

                    ros = new ROSLIB.Ros({
                        url: rosbridgeUrl
                    });

                    ros.on('connection', () => {
                        console.log('ZED Plugin: Connected to ROSBridge.');
                        displayMessage('Connected to ZED Camera. Waiting for image stream...', 'info');

                        // Create a ROS topic subscriber for the image
                        imageTopicSubscriber = new ROSLIB.Topic({
                            ros: ros,
                            name: rosImageTopic,
                            messageType: 'sensor_msgs/CompressedImage', // Even if compressed, rosbridge often wraps it in sensor_msgs/Image for base64
                            throttle_rate: throttleRate // Use the configured throttle rate
                        });

                        imageTopicSubscriber.subscribe((message) => {
                            // Add more console.log statements for debugging message content if needed
                            // console.log('ZED Plugin: Received image message. Encoding:', message.encoding, 'Data Type:', typeof message.data);

                            let imageData = message.data;
                            let mimeType = 'image/jpeg'; // Assuming JPEG after compression pipeline

                            if (typeof imageData === 'string') {
                                // Assume base64 encoded string from rosbridge for compressed images
                                if (imageData.startsWith('/9j/')) { // JPEG magic number
                                    mimeType = 'image/jpeg';
                                } else if (imageData.startsWith('iVBORw0KGgo')) { // PNG magic number
                                    mimeType = 'image/png';
                                } else {
                                    // This case should ideally not be hit if ROS pipeline outputs compressed image
                                    console.warn('ZED Plugin: Unrecognized base64 image data prefix. Assuming JPEG for display.');
                                }

                                const byteCharacters = atob(imageData);
                                const byteNumbers = new Array(byteCharacters.length);
                                for (let i = 0; i < byteCharacters.length; i++) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                const byteArray = new Uint8Array(byteNumbers);
                                const blob = new Blob([byteArray], { type: mimeType });

                                if (currentObjectURL) {
                                    URL.revokeObjectURL(currentObjectURL);
                                }

                                currentObjectURL = URL.createObjectURL(blob);
                                if (imgElement) {
                                    imgElement.src = currentObjectURL;
                                    imgElement.style.display = 'block'; // Ensure image is visible
                                }
                                // Clear any previous error messages on successful frame
                                if (errorMessageElement && errorMessageElement.parentElement) {
                                    errorMessageElement.parentElement.removeChild(errorMessageElement);
                                    errorMessageElement = null;
                                }

                            } else if (imageData instanceof ArrayBuffer || imageData instanceof Uint8Array) {
                                // This path would be hit if rosbridge uses binary encoding (e.g., bson) for compressed images.
                                console.warn('ZED Plugin: Received binary image data. Assuming JPEG for display.');
                                const blob = new Blob([imageData], { type: mimeType });

                                if (currentObjectURL) {
                                    URL.revokeObjectURL(currentObjectURL);
                                }
                                currentObjectURL = URL.createObjectURL(blob);
                                if (imgElement) {
                                    imgElement.src = currentObjectURL;
                                    imgElement.style.display = 'block';
                                }
                                if (errorMessageElement && errorMessageElement.parentElement) {
                                    errorMessageElement.parentElement.removeChild(errorMessageElement);
                                    errorMessageElement = null;
                                }

                            } else {
                                console.error('ZED Plugin: Unexpected image data format:', typeof imageData);
                                displayMessage('ZED Camera: Unexpected image data format from ROSBridge.', 'error');
                            }
                        });
                    });

                    ros.on('error', (error) => {
                        console.error('ZED Plugin: ROSBridge error:', error);
                        displayMessage('ZED Camera: ROSBridge connection error. Check URL and server.', 'error');
                        if (imageTopicSubscriber) {
                            imageTopicSubscriber.unsubscribe();
                            imageTopicSubscriber = null;
                        }
                    });

                    ros.on('close', (event) => {
                        console.log('ZED Plugin: ROSBridge closed:', event.code, event.reason);
                        if (!event.wasClean) {
                            displayMessage('ZED Camera: ROSBridge disconnected unexpectedly. Attempting to reconnect...', 'error');
                            // Optional: Implement a reconnect logic with a delay
                            setTimeout(() => {
                                connectAndSubscribe(domainObject.rosbridgeUrl, domainObject.rosImageTopic, domainObject.throttleRate);
                            }, 3000); // Try reconnecting after 3 seconds
                        } else {
                            displayMessage('ZED Camera: Disconnected.', 'info');
                        }
                        if (imageTopicSubscriber) {
                            imageTopicSubscriber.unsubscribe();
                            imageTopicSubscriber = null;
                        }
                        if (currentObjectURL) {
                            URL.revokeObjectURL(currentObjectURL);
                            currentObjectURL = null;
                        }
                        if (imgElement) {
                            imgElement.src = '';
                            imgElement.style.display = 'none';
                        }
                    });
                };

                return {
                    show(element) {
                        viewContainerElement = element; // Store the element passed to show
                        imgElement = document.createElement('img');
                        imgElement.style.width = '100%';
                        imgElement.style.height = '100%';
                        imgElement.style.objectFit = 'contain';
                        imgElement.style.display = 'none'; // Hide until first frame
                        element.appendChild(imgElement);

                        // Start connection when view is shown
                        connectAndSubscribe(domainObject.rosbridgeUrl, domainObject.rosImageTopic, domainObject.throttleRate);
                    },
                    onEditModeChange(editMode) {
                        // When entering edit mode, disconnect to allow changes
                        if (editMode) {
                            if (imageTopicSubscriber) {
                                imageTopicSubscriber.unsubscribe();
                                imageTopicSubscriber = null;
                            }
                            if (ros) {
                                ros.close();
                                ros = null;
                            }
                            if (currentObjectURL) {
                                URL.revokeObjectURL(currentObjectURL);
                                currentObjectURL = null;
                            }
                            if (imgElement) {
                                imgElement.src = '';
                                imgElement.style.display = 'none';
                            }
                            displayMessage('ZED Camera: In edit mode. Stream paused.', 'info');
                        } else {
                            // When exiting edit mode, attempt to reconnect
                            connectAndSubscribe(domainObject.rosbridgeUrl, domainObject.rosImageTopic, domainObject.throttleRate);
                        }
                    },
                    destroy: function () {
                        // Clean up all resources when view is destroyed
                        if (imageTopicSubscriber) {
                            imageTopicSubscriber.unsubscribe();
                            imageTopicSubscriber = null;
                        }
                        if (ros) {
                            ros.close();
                            ros = null;
                        }
                        if (currentObjectURL) {
                            URL.revokeObjectURL(currentObjectURL);
                            currentObjectURL = null;
                        }
                        if (imgElement && imgElement.parentElement) {
                            imgElement.parentElement.removeChild(imgElement);
                        }
                        imgElement = null;
                        if (errorMessageElement && errorMessageElement.parentElement) {
                            errorMessageElement.parentElement.removeChild(errorMessageElement);
                        }
                        errorMessageElement = null;
                        console.log('ZED Camera View destroyed.');
                    }
                };
            }
        });
        // --- End Define view provider ---

        return {
            destroy: () => {}
        };
    };
}