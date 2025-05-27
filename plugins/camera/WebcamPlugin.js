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

const WEBCAM_FEED_KEY = 'webcam-feed';

window.WebcamPlugin = function WebcamPlugin() {
    return function install(openmct) {
        openmct.types.addType(WEBCAM_FEED_KEY, {
            name: 'Webcam Feed',
            description: 'Displays a live video feed from the local computer\'s webcam.',
            creatable: true,
            cssClass: 'icon-camera', // Using a camera icon
            initialize(domainObject) {
                // No specific properties needed for a basic webcam feed
            },
            form: [] // No configuration form for this simple plugin
        });

        openmct.objectViews.addProvider({
            key: 'webcam-feed-view',
            name: 'Webcam Feed View',
            canView: (domainObject) => {
                return domainObject.type === WEBCAM_FEED_KEY;
            },
            view: (domainObject) => {
                let videoElement = null;
                let mediaStream = null; // To hold the camera stream
                let statusMessageElement = null;

                const displayStatus = (message, type = 'info') => {
                    if (statusMessageElement) {
                        if (statusMessageElement.parentElement) {
                            statusMessageElement.parentElement.removeChild(statusMessageElement);
                        }
                        statusMessageElement = null;
                    }

                    statusMessageElement = document.createElement('div');
                    statusMessageElement.style.position = 'absolute';
                    statusMessageElement.style.top = '50%';
                    statusMessageElement.style.left = '50%';
                    statusMessageElement.style.transform = 'translate(-50%, -50%)';
                    statusMessageElement.style.padding = '10px 20px';
                    statusMessageElement.style.borderRadius = '5px';
                    statusMessageElement.style.zIndex = '10';
                    statusMessageElement.style.fontSize = '14px';
                    statusMessageElement.style.textAlign = 'center';

                    if (type === 'error') {
                        statusMessageElement.style.backgroundColor = 'rgba(217, 83, 79, 0.9)'; // Red
                        statusMessageElement.style.color = 'white';
                    } else if (type === 'warning') {
                        statusMessageElement.style.backgroundColor = 'rgba(240, 173, 78, 0.9)'; // Orange
                        statusMessageElement.style.color = 'black';
                    } else {
                        statusMessageElement.style.backgroundColor = 'rgba(92, 184, 92, 0.9)'; // Green
                        statusMessageElement.style.color = 'white';
                    }
                    statusMessageElement.textContent = message;

                    if (videoElement && videoElement.parentElement) {
                        videoElement.parentElement.appendChild(statusMessageElement);
                    }
                };

                const startWebcam = async () => {
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        displayStatus('Webcam not supported by this browser.', 'error');
                        console.error('Webcam not supported by this browser.');
                        return;
                    }

                    try {
                        displayStatus('Requesting webcam access...', 'info');
                        // Request access to video stream (front-facing camera preferred if available)
                        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                        videoElement.srcObject = mediaStream;
                        videoElement.play(); // Start playing the video
                        videoElement.style.display = 'block'; // Show video element
                        if (statusMessageElement && statusMessageElement.parentElement) {
                            statusMessageElement.parentElement.removeChild(statusMessageElement); // Clear status message
                            statusMessageElement = null;
                        }
                        console.log('Webcam stream started.');
                    } catch (err) {
                        displayStatus('Failed to access webcam. Please ensure it\'s connected and permissions are granted.', 'error');
                        console.error('Error accessing webcam:', err);
                        videoElement.style.display = 'none'; // Hide video element on error
                    }
                };

                const stopWebcam = () => {
                    if (mediaStream) {
                        mediaStream.getTracks().forEach(track => track.stop()); // Stop all tracks
                        mediaStream = null;
                        videoElement.srcObject = null;
                        console.log('Webcam stream stopped.');
                    }
                };

                return {
                    show(element) {
                        // Create video element
                        videoElement = document.createElement('video');
                        videoElement.style.width = '100%';
                        videoElement.style.height = '100%';
                        videoElement.style.objectFit = 'contain'; // Maintain aspect ratio
                        videoElement.style.backgroundColor = '#333'; // Dark background
                        videoElement.style.display = 'none'; // Hide until stream starts
                        videoElement.autoplay = true; // Autoplay is necessary for srcObject
                        videoElement.playsInline = true; // Important for mobile browsers
                        element.appendChild(videoElement);

                        // Start the webcam when the view is shown
                        startWebcam();
                    },
                    onEditModeChange(editMode) {
                        // Stop webcam when entering edit mode, restart when exiting
                        if (editMode) {
                            stopWebcam();
                            displayStatus('Webcam: In edit mode. Stream paused.', 'info');
                        } else {
                            startWebcam();
                        }
                    },
                    destroy: function () {
                        // Stop the webcam and clean up resources when the view is destroyed
                        stopWebcam();
                        if (videoElement && videoElement.parentElement) {
                            videoElement.parentElement.removeChild(videoElement);
                        }
                        videoElement = null;
                        if (statusMessageElement && statusMessageElement.parentElement) {
                            statusMessageElement.parentElement.removeChild(statusMessageElement);
                        }
                        statusMessageElement = null;
                        console.log('Webcam Feed View destroyed.');
                    }
                };
            }
        });

        return {
            destroy: () => {}
        };
    };
}