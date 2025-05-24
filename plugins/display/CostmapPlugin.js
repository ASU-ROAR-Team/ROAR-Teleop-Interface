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

// Define the key for your new object type
const COSTMAP_MAP_KEY = 'costmap-map';

// Define the plugin factory function
// Assign the function to the window object to make it globally accessible
window.CostmapMapPlugin = function CostmapMapPlugin(options) {
    return function install(openmct) {
        // --- Define the new object type ---
        openmct.types.addType(COSTMAP_MAP_KEY, {
            name: 'Costmap Map',
            description: 'Displays a map based on a costmap and visualizes robot state.',
            creatable: true,
            cssClass: 'icon-map',
            initialize(domainObject) {
                // Initialize properties for the object
                domainObject.costmapSourceUrl = options?.defaultCostmapSourceUrl || '';

                // Properties for coordinate transformation constants
                domainObject.pixelOffsetX = options?.defaultPixelOffsetX || 208; // X offset in pixels
                domainObject.pixelOffsetY = options?.defaultPixelOffsetY || 761; // Y offset in pixels (constant in your formula)
                domainObject.pixelsPerMeter = options?.defaultPixelsPerMeter || 20.2; // Scaling factor (pixels per meter)

                // Properties for Checkpoints and Final Goal
                // Corrected default values to be empty arrays/null instead of JSON strings
                // These defaults are used when a *new* object is created via the UI.
                domainObject.checkpointsData = options?.checkpointsData || []; // Default to empty array
                domainObject.finalGoalData = options?.finalGoalData || null; // Default to null for a single point

                // --- NEW: Property for Landmarks ---
                // Store landmarks as a JSON array of [x, y] tuples
                // Corrected default value to be an empty array instead of a JSON string
                domainObject.landmarksData = options?.landmarksData || []; // Default to empty array
                // --- End NEW ---
            },
            form: [
                {
                    key: 'costmapSourceUrl',
                    name: 'Costmap Source URL (Image or CSV)',
                    control: 'textfield',
                    required: true,
                    cssClass: 'l-input'
                },
                {
                    key: 'pixelOffsetX',
                    name: 'Pixel Offset X',
                    control: 'numberfield',
                    required: true,
                    cssClass: 'l-input'
                },
                 {
                     key: 'pixelOffsetY',
                     name: 'Pixel Offset Y',
                     control: 'numberfield',
                     required: true,
                     cssClass: 'l-input'
                 },
                 {
                     key: 'pixelsPerMeter',
                     name: 'Pixels Per Meter',
                     control: 'numberfield',
                     required: true,
                     cssClass: 'l-input'
                 },
                 // Form fields for Checkpoints and Final Goal
                 {
                     key: 'checkpointsData',
                     name: 'Checkpoints (JSON array of [x, y])',
                     control: 'textarea', // Use textarea for multi-line JSON input
                     required: false,
                     cssClass: 'l-input'
                 },
                 {
                     key: 'finalGoalData',
                     name: 'Final Goal (JSON array [x, y])',
                     control: 'textfield', // Use textfield for single point JSON input
                     required: false,
                     cssClass: 'l-input'
                 },
                 // --- NEW: Form field for Landmarks ---
                 {
                     key: 'landmarksData',
                     name: 'Landmarks (JSON array of [x, y])',
                     control: 'textarea', // Use textarea for multi-line JSON input
                     required: false,
                     cssClass: 'l-input'
                 }
                 // --- End NEW ---
            ]
        });
        // --- End Define new object type ---


        // --- Define the view provider for the new object type ---
        openmct.objectViews.addProvider({
            key: 'costmap-map-view',
            name: 'Costmap Map View',
            canView: (domainObject) => {
                return domainObject.type === COSTMAP_MAP_KEY;
            },
            view: (domainObject, objectPath) => {
                let mapComponent = null;

                return {
                    show(element, editMode) {
                        mapComponent = new CostmapMapComponent(element, domainObject, openmct);
                        mapComponent.render();
                    },
                    onEditModeChange(editMode) {
                        // Optional: Handle changes to edit mode
                    },
                    destroy: function (element) {
                        if (mapComponent && typeof mapComponent.destroy === 'function') {
                            mapComponent.destroy();
                        }
                        mapComponent = null;
                    }
                };
            }
        });
        // --- End Define view provider ---

        return {
            destroy: () => { }
        };
    };
}


// --- 2. Create the Visualization Component (CostmapMapComponent) ---
// This component handles loading the costmap and drawing dynamic elements on a Canvas.

class CostmapMapComponent {
    constructor(parentElement, domainObject, openmct) {
        this.parentElement = parentElement;
        this.domainObject = domainObject;
        this.openmct = openmct;

        this.canvas = null;
        this.ctx = null;
        this.costmapSourceType = null; // 'image' or 'csv'
        this.costmapImage = null; // For image source
        this.costmapData = null; // For CSV source (2D array)

        // Coordinate transformation constants loaded from the domain object
        this.pixelOffsetX = this.domainObject.pixelOffsetX;
        this.pixelOffsetY = this.domainObject.pixelOffsetY;
        this.pixelsPerMeter = this.domainObject.pixelsPerMeter;

        this.mapWidthPixels = 0; // Determined by source (image width or CSV columns)
        this.mapHeightPixels = 0; // Determined by source (image height or CSV rows)
        this.minCost = 0; // For CSV normalization
        this.maxCost = 0; // For CSV normalization


        // ROS connection (assuming ROSLIB is available globally)
        this.ros = null;

        // ROS Topics and Subscribers (replace with your actual topics)
        this.robotPoseTopic = null;
        this.pathTopic = null;
        this.traversedPathTopic = null;
        this.lookaheadTopic = null;
        this.obstaclesTopic = null;
        // Removed: this.checkpointsTopic = null; // Checkpoints are static from properties now
        // Removed: this.landmarksTopic = null; // Landmarks are static from properties now

        // Data storage for visualization elements
        this.robotPosition = null; // {x, y, theta}
        this.globalPath = [];      // [{x, y}]
        this.traversedPath = [];   // [{x, y}]
        this.lookaheadPoint = null; // {x, y}
        this.obstacles = new Map(); // Map<obstacle_id, {x, y, radius}>

        // Checkpoints and Final Goal from properties
        // Revised: Process data, handling potential string format from form input
        this.checkpoints = this.processCheckpointsData(this.domainObject.checkpointsData);
        this.finalGoal = this.processFinalGoalData(this.domainObject.finalGoalData);

        // --- NEW: Landmarks from properties ---
        // Revised: Process data, handling potential string format from form input
        this.landmarks = this.processLandmarksData(this.domainObject.landmarksData);
        // --- End NEW ---


        // Bind event handlers
        this.resizeHandler = this.handleResize.bind(this);

        // Variables for browser-side rate limiting
        this.lastProcessedPoseTime = 0; // Timestamp of the last pose message *processed* for drawing
        this.minProcessingIntervalMs = 33; // Adjust this value as needed for desired smoothness vs. responsiveness

        // *** ADDED CONSOLE LOGS FOR INITIAL DATA ***
    }

    // --- Methods to process data from properties (handling potential JSON strings) ---
    processCheckpointsData(data) {
        let processedData = [];
        if (typeof data === 'string') {
            try {
                processedData = JSON.parse(data);
            } catch (error) {
                console.error('Map: Error parsing checkpoints JSON string:', error, data);
                return []; // Return empty array on parsing error
            }
        } else if (Array.isArray(data)) {
             processedData = data;
        } else {
            console.warn('Map: Checkpoints data is not a string or array, or is null/undefined.', data);
            return []; // Return empty array if data is not string or array
        }

        // Basic validation: check if it's an array of arrays with 2 numbers
        if (Array.isArray(processedData) && processedData.every(cp => Array.isArray(cp) && cp.length === 2 && typeof cp[0] === 'number' && typeof cp[1] === 'number')) {
            return processedData.map(cp => ({ x: cp[0], y: cp[1] })); // Convert to {x, y} objects
        } else {
            console.warn('Map: Invalid checkpoints data format after processing. Expected array of [x, y] arrays.', processedData);
            return []; // Return empty array on invalid format
        }
    }

    processFinalGoalData(data) {
        let processedData = null;
         if (typeof data === 'string') {
             try {
                 processedData = JSON.parse(data);
             } catch (error) {
                 console.error('Map: Error parsing final goal JSON string:', error, data);
                 return null; // Return null on parsing error
             }
         } else if (Array.isArray(data) && data.length === 2 && typeof data[0] === 'number' && typeof data[1] === 'number') {
              processedData = data; // Already in the expected array format
         } else if (data === null || data === undefined) {
              return null; // Explicitly return null if input is null/undefined
         }
         else {
             console.warn('Map: Final goal data is not a string or array, or is invalid format.', data);
             return null; // Return null if data is not string or array or invalid format
         }


         // Basic validation: check if it's an array with 2 numbers
         if (Array.isArray(processedData) && processedData.length === 2 && typeof processedData[0] === 'number' && typeof processedData[1] === 'number') {
             return { x: processedData[0], y: processedData[1] }; // Convert to {x, y} object
         } else {
             console.warn('Map: Invalid final goal data format after processing. Expected [x, y] array.', processedData);
             return null; // Return null on invalid format
         }
    }

    // --- NEW: Method to process Landmarks data from properties (handling potential JSON strings) ---
    processLandmarksData(data) {
        let processedData = [];
        if (typeof data === 'string') {
            try {
                processedData = JSON.parse(data);
            } catch (error) {
                console.error('Map: Error parsing landmarks JSON string:', error, data);
                return []; // Return empty array on parsing error
            }
        } else if (Array.isArray(data)) {
            processedData = data;
        } else {
             console.warn('Map: Landmarks data is not a string or array, or is null/undefined.', data);
             return []; // Return empty array if data is not string or array
        }

        // Basic validation: check if it's an array of arrays with 2 numbers
        if (Array.isArray(processedData) && processedData.every(lm => Array.isArray(lm) && lm.length === 2 && typeof lm[0] === 'number' && typeof lm[1] === 'number')) {
            return processedData.map(lm => ({ x: lm[0], y: lm[1] })); // Convert to {x, y} objects
        } else {
            console.warn('Map: Invalid landmarks data format after processing. Expected array of [x, y] arrays.', processedData);
            return []; // Return empty array on invalid format
        }
    }
    // --- End NEW ---


    render() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.parentElement.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.handleResize();
        window.addEventListener('resize', this.resizeHandler);

        // Determine costmap source type and load accordingly
        if (this.domainObject.costmapSourceUrl.toLowerCase().endsWith('.csv')) {
            this.costmapSourceType = 'csv';
            this.loadCostmapData(this.domainObject.costmapSourceUrl);
        } else if (this.domainObject.costmapSourceUrl) {
             this.costmapSourceType = 'image';
             this.loadCostmapImage();
        } else {
             console.error('Map: Costmap Source URL is not provided in object properties.');
             if (this.ctx) {
                 this.ctx.fillStyle = 'red';
                 this.ctx.font = '20px Arial';
                 this.ctx.fillText('Costmap Source URL not set.', 10, 30);
             }
        }


        // Setup ROS connection and subscribers
        this.setupRos();

        // Initial draw (might show loading message)
        this.drawMap();
    }

    handleResize() {
        // Adjust canvas drawing buffer size to match display size
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // Redraw the map after resizing
        this.drawMap();
    }

    // --- Method to load Costmap Image (if source is PNG/JPG) ---
    loadCostmapImage() {
        this.costmapImage = new Image();
        this.costmapImage.src = '/images/costmap.png'
        this.costmapImage.onload = () => {
            this.mapWidthPixels = this.costmapImage.width;
            this.mapHeightPixels = this.costmapImage.height;
            this.drawMap(); // Redraw once image is loaded
        };
        this.costmapImage.onerror = (error) => {
            console.error('Map: Error loading costmap image:', error);
            if (this.ctx) {
                this.ctx.fillStyle = 'red';
                this.ctx.font = '20px Arial';
                this.ctx.fillText('Error loading map image.', 10, 30);
            }
        };
        ;
    }

    // --- Method to load and parse Costmap CSV (if source is CSV) ---
    async loadCostmapData(csvUrl) {
        try {
            const response = await fetch(csvUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const csvText = await response.text();

            // Simple manual parsing (consider a library for robustness)
            const rows = csvText.trim().split('\n');
            this.costmapData = rows.map(row => row.split(',').map(Number)); // Assuming comma delimiter and numbers

            this.mapHeightPixels = this.costmapData.length;
            if (this.mapHeightPixels > 0) {
                 this.mapWidthPixels = this.costmapData[0].length;
            } else {
                 this.mapWidthPixels = 0;
            }

            if (this.mapWidthPixels === 0 || this.mapHeightPixels === 0) {
                 console.error('Map: Costmap data is empty or invalid.');
                 if (this.ctx) {
                     this.ctx.fillStyle = 'red';
                     this.ctx.font = '20px Arial';
                     this.ctx.fillText('Invalid costmap data.', 10, 30);
                 }
                 return;
            }

            // Find min/max cost for normalization (INCLUDING -1 if present, as per original request)
            this.minCost = Infinity;
            this.maxCost = -Infinity;
            for (const row of this.costmapData) {
                 for (const value of row) {
                     // Include all values in min/max calculation
                     if (value < this.minCost) this.minCost = value;
                     if (value > this.maxCost) this.maxCost = value;
                 }
            }


            // The coordinate transformation constants (pixelOffsetX, pixelOffsetY, pixelsPerMeter)
            // are loaded from domainObject properties in the constructor.

            this.drawMap(); // Redraw once data is loaded

        } catch (error) {
            console.error('Map: Error loading or parsing costmap CSV:', error);
            if (this.ctx) {
                this.ctx.fillStyle = 'red';
                this.ctx.font = '20px Arial';
                this.ctx.fillText('Error loading costmap CSV.', 10, 30);
            }
        }
    }

    // --- Modified Function to get color from cost value (removed -1 handling) ---
    getCostColor(costValue) {
        // Handle case where min and max cost are the same or invalid range
        if (this.maxCost <= this.minCost) {
             // If all valid costs are the same or range is invalid, return a mid-gray
             // For -1 specifically, we might want a distinct color if not included in range
             if (costValue === -1) {
                return 'rgba(100, 100, 100, 0.5)'; // Semi-transparent gray for -1
             }
             return 'rgb(128, 128, 128)'; // Mid-gray for other cases
        }

        // Normalize cost to 0-1 range based on the min/max of all costs (excluding -1 for normalization range if desired)
        // However, your original code included -1 in min/max, so keeping that.
        const normalizedCost = (costValue - this.minCost) / (this.maxCost - this.minCost);

        // --- Implement a simple colormap (Blue to Red) ---
        // This maps 0-1 normalized cost to a color gradient.
         const r = Math.floor(normalizedCost * 255); // Red increases with cost
         const g = 0;
         const b = Math.floor((1 - normalizedCost) * 255); // Blue decreases with cost

        return `rgb(${r}, ${g}, ${b})`; // Return the color string
        // --- End Modified ---
    }
    // --- End Modified Function ---


    // --- Coordinate Transformation Functions (Based on your Python logic) ---
    // These functions convert real-world ROS coordinates (meters) to pixel coordinates
    // relative to the top-left of the costmap data/image, using your constants.
    realToPixelX(realX) {
        // Python: int(208 + 20.2 * x)
        // JavaScript: pixelX = pixelOffsetX + pixelsPerMeter * realX
        return this.pixelOffsetX + this.pixelsPerMeter * realX;
    }

    realToPixelY(realY) {
        // Python: int(761 - 20.2 * y)
        // JavaScript: pixelY = pixelOffsetY - pixelsPerMeter * realY
        // This matches your Python logic exactly.
        return this.pixelOffsetY - this.pixelsPerMeter * realY;
    }

    // --- Drawing Function ---
    drawMap() {
        if (!this.ctx || !this.canvas) {
            console.warn('Map: Canvas context not available for drawing.');
            return;
        }

        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Determine scaling factors from costmap dimensions to current canvas size
        // Use 1 as a fallback if map dimensions are not yet determined
        const scaleX = this.mapWidthPixels > 0 ? this.canvas.width / this.mapWidthPixels : 1;
        const scaleY = this.mapHeightPixels > 0 ? this.canvas.height / this.mapHeightPixels : 1;

        // Use the smaller scale factor for marker size scaling to avoid distortion
        const markerScale = Math.min(scaleX, scaleY);


        // --- Draw the costmap background (Image or CSV pixels) ---
        if (this.costmapSourceType === 'image' && this.costmapImage && this.costmapImage.complete) {
            // Draw the image, scaled to fill the canvas
            this.ctx.drawImage(this.costmapImage, 0, 0, this.canvas.width, this.canvas.height);
        } else if (this.costmapSourceType === 'csv' && this.costmapData && this.mapWidthPixels > 0 && this.mapHeightPixels > 0) {
            // Draw the costmap pixel by pixel from CSV data
            for (let y = 0; y < this.mapHeightPixels; y++) {
                for (let x = 0; x < this.mapWidthPixels; x++) {
                    const cost = this.costmapData[y][x];
                    // Use the modified getCostColor function
                    const color = this.getCostColor(cost);
                    this.ctx.fillStyle = color;
                    // Draw a rectangle for each pixel, scaled to the canvas size
                    this.ctx.fillRect(x * scaleX, y * scaleY, scaleX, scaleY);
                }
            }
        } else {
            // Draw a placeholder or message if data is not loaded
             this.ctx.fillStyle = 'gray';
             this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
             this.ctx.fillStyle = 'white';
             this.ctx.font = '20px Arial';
             this.ctx.fillText('Loading map data...', 10, 30);
        }

        // --- Draw other elements (convert ROS coords to pixel coords and scale) ---

        // Draw Global Path
        if (this.globalPath.length > 1) {
            this.ctx.strokeStyle = 'yellow';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            // Convert the first point to pixel coordinates and scale
            const startPixel = {
                x: this.realToPixelX(this.globalPath[0].x) * scaleX,
                y: this.realToPixelY(this.globalPath[0].y) * scaleY
            };
            this.ctx.moveTo(startPixel.x, startPixel.y);
            // Convert subsequent points and draw lines
            for (let i = 1; i < this.globalPath.length; i++) {
                const nextPixel = {
                    x: this.realToPixelX(this.globalPath[i].x) * scaleX,
                    y: this.realToPixelY(this.globalPath[i].y) * scaleY
                };
                this.ctx.lineTo(nextPixel.x, nextPixel.y);
            }
            this.ctx.stroke();
        }

       // Draw Traversed Path
        if (this.traversedPath.length > 1) {
             this.ctx.strokeStyle = 'blue';
             this.ctx.lineWidth = 2;
             this.ctx.beginPath();
             // Convert the first point to pixel coordinates and scale
             const startPixel = {
                 x: this.realToPixelX(this.traversedPath[0].x) * scaleX,
                 y: this.realToPixelY(this.traversedPath[0].y) * scaleY
             };
             this.ctx.moveTo(startPixel.x, startPixel.y);
             // Convert subsequent points and draw lines
             for (let i = 1; i < this.traversedPath.length; i++) {
                 const nextPixel = {
                     x: this.realToPixelX(this.traversedPath[i].x) * scaleX,
                     y: this.realToPixelY(this.traversedPath[i].y) * scaleY
                 };
                 this.ctx.lineTo(nextPixel.x, nextPixel.y);
             }
             this.ctx.stroke();
        }


        // Draw Robot Position - Only draw if robotPosition data exists
        if (this.robotPosition) {
            // Convert robot's real-world position to pixel coordinates and scale
            const robotPixel = {
                x: this.realToPixelX(this.robotPosition.x) * scaleX,
                y: this.realToPixelY(this.robotPosition.y) * scaleY
            };
            this.ctx.fillStyle = 'red';
            this.ctx.beginPath();
            this.ctx.arc(robotPixel.x, robotPixel.y, 5 * markerScale, 0, Math.PI * 2); // Scaled radius
            this.ctx.fill();

            // Draw orientation line (adjust length based on scale if needed)
            const lineLength = 10 * markerScale; // Scaled line length
            // Calculate the end point of the orientation line based on robot's yaw
            const endX = robotPixel.x + lineLength * Math.cos(this.robotPosition.theta);
            const endY = robotPixel.y - lineLength * Math.sin(this.robotPosition.theta); // Subtract because canvas Y is inverted
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 2 * markerScale; // Scaled line width
            this.ctx.beginPath();
            this.ctx.moveTo(robotPixel.x, robotPixel.y);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        }

        // Draw Lookahead Point - Only draw if lookaheadPoint data exists
        if (this.lookaheadPoint) {
            // Convert lookahead point's real-world position to pixel coordinates and scale
            const lookaheadPixel = {
                x: this.realToPixelX(this.lookaheadPoint.x) * scaleX,
                y: this.realToPixelY(this.lookaheadPoint.y) * scaleY
            };
             const lookaheadSize = 8 * markerScale; // Scaled size
            this.ctx.fillStyle = 'cyan';
            this.ctx.fillRect(lookaheadPixel.x - lookaheadSize / 2, lookaheadPixel.y - lookaheadSize / 2, lookaheadSize, lookaheadSize); // Draw a scaled square
        }

        // Draw Obstacles - Only draw if obstacles data exists and has items
        if (this.obstacles.size > 0) {
             // Iterate through the Map of obstacles
             this.obstacles.forEach(obstacle => {
                 // Convert obstacle's real-world position to pixel coordinates and scale
                 const obstaclePixel = {
                     x: this.realToPixelX(obstacle.x) * scaleX,
                     y: this.realToPixelY(obstacle.y) * scaleY
                 };
                 // Scale the radius as well (assuming uniform scaling)
                 const pixelRadius = obstacle.radius * this.pixelsPerMeter * markerScale; // Scale radius based on pixels per meter and canvas scale

                 this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; // Red with some transparency
                 this.ctx.beginPath();
                 // Draw a circle for the obstacle
                 this.ctx.arc(obstaclePixel.x, obstaclePixel.y, pixelRadius, 0, Math.PI * 2);
                 this.ctx.fill();
             });
        }


        // Draw Checkpoints (from properties) - Triangle shape, Magenta color, Scaled
        if (Array.isArray(this.checkpoints) && this.checkpoints.length > 0) {
             this.checkpoints.forEach((checkpoint, index) => {
                  // Convert checkpoint's real-world position to pixel coordinates and scale
                  const checkpointPixel = {
                      x: this.realToPixelX(checkpoint.x) * scaleX,
                      y: this.realToPixelY(checkpoint.y) * scaleY
                  };
                  // *** ADDED CONSOLE LOG FOR CHECKPOINT PIXEL COORDS ***
                  // *** END ADDED CONSOLE LOG ***

                  // Draw a magenta triangle, scaled
                  const triangleSize = 10 * markerScale; // Scaled size
                  this.ctx.fillStyle = 'magenta'; // Magenta fill
                  this.ctx.beginPath();
                  this.ctx.moveTo(checkpointPixel.x, checkpointPixel.y - triangleSize / 2); // Top point
                  this.ctx.lineTo(checkpointPixel.x - triangleSize / 2, checkpointPixel.y + triangleSize / 2); // Bottom-left point
                  this.ctx.lineTo(checkpointPixel.x + triangleSize / 2, checkpointPixel.y + triangleSize / 2); // Bottom-right point
                  this.ctx.closePath(); // Close the triangle path
                  this.ctx.fill(); // Fill the triangle

                  // Optional: Add a number label for checkpoints - Scale font size too
                  // const fontSize = 12 * markerScale;
                  // this.ctx.fillStyle = 'white';
                  // this.ctx.font = `${fontSize}px Arial`;
                  // this.ctx.fillText(this.checkpoints.indexOf(checkpoint) + 1, checkpointPixel.x + 6 * markerScale, checkpointPixel.y + 4 * markerScale);
             });
        }

        // --- NEW: Draw Landmarks (from properties) - Square shape, Green color, Scaled ---
        if (Array.isArray(this.landmarks) && this.landmarks.length > 0) {
             this.landmarks.forEach((landmark, index) => {
                  // Convert landmark's real-world position to pixel coordinates and scale
                  const landmarkPixel = {
                      x: this.realToPixelX(landmark.x) * scaleX,
                      y: this.realToPixelY(landmark.y) * scaleY
                  };
                  // *** ADDED CONSOLE LOG FOR LANDMARK PIXEL COORDS ***
                  // *** END ADDED CONSOLE LOG ***

                  // Draw a green square, scaled
                  const squareSize = 8 * markerScale; // Scaled size
                  this.ctx.fillStyle = 'green'; // Green fill
                  this.ctx.fillRect(landmarkPixel.x - squareSize / 2, landmarkPixel.y - squareSize / 2, squareSize, squareSize); // Draw a scaled square


                  // Optional: Add a label (e.g., L01, L02) - Scale font size and position too
                  // const fontSize = 12 * markerScale;
                  // this.ctx.fillStyle = 'black'; // Label color
                  // this.ctx.font = `${fontSize}px Arial`; // Label font
                  // // Position the text slightly below and to the right of the marker
                  // this.ctx.fillText(`L${index + 1}`, landmarkPixel.x + 7 * markerScale, landmarkPixel.y + 10 * markerScale);
             });
        }
        // --- End NEW ---


        // Draw Final Goal (from properties) - 'X' shape, Lime color, Scaled
        if (this.finalGoal) {
             // Convert final goal's real-world position to pixel coordinates and scale
             const finalGoalPixel = {
                 x: this.realToPixelX(this.finalGoal.x) * scaleX,
                 y: this.realToPixelY(this.finalGoal.y) * scaleY
             };
             this.ctx.strokeStyle = 'lime'; // Use lime green for the final goal
             this.ctx.lineWidth = 3 * markerScale; // Scaled line width
             const xSize = 10 * markerScale; // Scaled size of the 'X'

             // Draw the 'X'
             this.ctx.beginPath();
             this.ctx.moveTo(finalGoalPixel.x - xSize / 2, finalGoalPixel.y - xSize / 2);
             this.ctx.lineTo(finalGoalPixel.x + xSize / 2, finalGoalPixel.y + xSize / 2);
             this.ctx.stroke();

             this.ctx.beginPath();
             this.ctx.moveTo(finalGoalPixel.x + xSize / 2, finalGoalPixel.y - xSize / 2);
             this.ctx.lineTo(finalGoalPixel.x - xSize / 2, finalGoalPixel.y + xSize / 2);
             this.ctx.stroke();

             // Optional: Add a label - Scale font size and position too
             // const fontSize = 14 * markerScale;
             // this.ctx.fillStyle = 'black';
             // this.ctx.font = `${fontSize}px Arial`;
             // this.ctx.fillText('Goal', finalGoalPixel.x + 10 * markerScale, finalGoalPixel.y + 5 * markerScale);
        }


        // Optional: Add labels or legend
    }

    // --- ROS Connection and Topic Setup ---
    setupRos() {
        // Setup ROS connection if it's not already established
        if (!this.ros && typeof ROSLIB !== 'undefined') {
            try {
                 this.ros = new ROSLIB.Ros({
                     url: 'ws://localhost:9090' // Match your rosbridge_websocket URL
                 });

                 this.ros.on('connection', () => {
                     this.setupRosTopics(); // Setup topics once connected
                 });

                 this.ros.on('error', (error) => { console.error('Map: ROS Connection error:', error); });

                 // Clear dynamic data on ROS connection close
                 this.ros.on('close', () => {
                     console.warn('Map: ROS Connection closed. Clearing dynamic data.');
                     this.clearDynamicData(); // Clear the stored data
                     this.drawMap(); // Redraw the map to show cleared data
                 });

            } catch (error) {
                 console.error('Map: Error setting up ROS connection:', error);
                 this.ros = null; // Ensure ros is null if connection fails
            }
        } else if (typeof ROSLIB === 'undefined') {
             console.error('Map: ROSLIB library not available. Cannot setup ROS.');
             return; // Cannot proceed without ROSLIB
        }

        // If ROS is already connected, setup topics immediately
        if (this.ros && this.ros.isConnected) {
             this.setupRosTopics();
        } else if (this.ros) {
             console.warn('Map: ROS connection not established. Waiting for connection to setup topics.');
             // The 'connection' listener above will handle setting up topics
         }
    }

    setupRosTopics() {
         if (!this.ros || !this.ros.isConnected) {
              console.warn('Map: ROS not connected, cannot setup topics.');
              return;
         }

         // --- Setup Subscribers for relevant ROS topics ---
         // Replace topic names and message types with your actual topics

         // Robot Pose
         this.robotPoseTopic = new ROSLIB.Topic({
             ros: this.ros,
             name: '/gazebo/model_states', // Replace with your robot pose topic
             messageType: 'gazebo_msgs/ModelStates' // Replace with your pose message type
         });
         this.robotPoseTopic.subscribe(this.handleRobotPose.bind(this));

         // Global Path
         this.pathTopic = new ROSLIB.Topic({
             ros: this.ros,
             name: '/Path', // Replace with your planned path topic
             messageType: 'nav_msgs/Path' // Replace with your path message type
         });
         this.pathTopic.subscribe(this.handleGlobalPath.bind(this));

         // Traversed Path (You might need to publish this from your Control node)
         this.traversedPathTopic = new ROSLIB.Topic({
             ros: this.ros,
             name: '/traversed_path', // Example topic name
             messageType: 'nav_msgs/Path' // Example message type
         });
         this.traversedPathTopic.subscribe(this.handleTraversedPath.bind(this));


         // Obstacles (Using the roar_msgs/Obstacle message definition you provided)
         this.obstaclesTopic = new ROSLIB.Topic({
             ros: this.ros,
             name: '/obstacles', // Replace with your obstacle topic name
             messageType: 'roar_msgs/Obstacle' // Use the message type name
         });
         this.obstaclesTopic.subscribe(this.handleObstacles.bind(this));

         // Checkpoints (If published, or get from APF object properties if static)
         // If you later decide to publish checkpoints from ROS, uncomment this and add handler:
         // this.checkpointsTopic = new ROSLIB.Topic({...});
         // this.checkpointsTopic.subscribe(this.handleCheckpoints.bind(this));

         // Landmarks (If published, or get from a static source)
         // If you later decide to publish landmarks from ROS, uncomment this and add handler:
         // this.landmarksTopic = new ROSLIB.Topic({...});
         // this.landmarksTopic.subscribe(this.handleLandmarks.bind(this));

         // Lookahead Point (If published separately by APF)
         // this.lookaheadTopic = new ROSLIB.Topic({...});
         // this.lookaheadTopic.subscribe(this.handleLookahead.bind(this));


    }

    // --- Method to clear dynamic data ---
    clearDynamicData() {
        this.robotPosition = null;
        this.globalPath = [];
        this.traversedPath = [];
        this.lookaheadPoint = null;
        this.obstacles.clear(); // Clear the Map

    }
    // --- End Method to clear dynamic data ---


    // --- ROS Message Handlers (update data and redraw) ---
    handleRobotPose(msg) {
        // Implement browser-side rate limiting
        const now = performance.now();
        if (now - this.lastProcessedPoseTime < this.minProcessingIntervalMs) {
            // If not enough time has passed since the last processed update, discard this message
            return;
        }
        // Update the timestamp of the last processed update
        this.lastProcessedPoseTime = now;

        try {
            const robotName = 'roar'; // Match your robot model name
            const robotIndex = msg.name.indexOf(robotName);
            if (robotIndex !== -1) {
                const pose = msg.pose[robotIndex];
                const orientation = pose.orientation;

                // Create ROSLIB.Quaternion
                const q = new ROSLIB.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);

                let rpy = { x: 0, y: 0, z: 0 };

                // Check if toEuler method exists before calling, or use manual conversion
                if (typeof q.toEuler === 'function') {
                    rpy = q.toEuler();
                } else {
                    // Manual Quaternion to Euler (Yaw) Conversion
                    // This is a simplified conversion assuming the robot is mostly flat (no pitch/roll)
                    const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
                    const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
                    rpy.z = Math.atan2(siny_cosp, cosy_cosp);
                }

                this.robotPosition = {
                    x: pose.position.x,
                    y: pose.position.y,
                    theta: rpy.z // Use the calculated yaw
                };
                this.drawMap(); // Redraw when robot pose updates
            }
        } catch (error) {
            console.error('Map: Error processing robot pose message:', error);
        }
    }

    handleGlobalPath(msg) {
        // Ensure msg.poses is an array before mapping
        if (Array.isArray(msg.poses)) {
            this.globalPath = msg.poses.map(p => ({ x: p.pose.position.x, y: p.pose.position.y }));
            this.drawMap(); // Redraw when global path updates
        } else {
            console.warn('Map: Received global path message with invalid poses data.', msg);
            this.globalPath = []; // Clear path on invalid data
            this.drawMap(); // Redraw
        }
    }

    handleTraversedPath(msg) {
         // Ensure msg.poses is an array before mapping
         if (Array.isArray(msg.poses)) {
            this.traversedPath = msg.poses.map(p => ({ x: p.pose.position.x, y: p.pose.position.y }));
            this.drawMap(); // Redraw when traversed path updates
         } else {
             console.warn('Map: Received traversed path message with invalid poses data.', msg);
             this.traversedPath = []; // Clear path on invalid data
             this.drawMap(); // Redraw
         }
    }

    // Handle Obstacle message based on roar_msgs/Obstacle definition
    handleObstacles(msg) {
        // Assuming each message is for a single obstacle update.
        // If your topic sends a list of obstacles in one message, this needs adjustment.
        try {
            // Basic validation for expected fields
            if (msg && msg.id && msg.id.data !== undefined && msg.position && msg.position.pose && msg.position.pose.position && msg.radius && msg.radius.data !== undefined) {
                const obstacleId = msg.id.data;
                const obstacleData = {
                    x: msg.position.pose.position.x,
                    y: msg.position.pose.position.y,
                    radius: msg.radius.data
                };
                // Store or update the obstacle data in the Map using its ID as the key
                this.obstacles.set(obstacleId, obstacleData);
                this.drawMap(); // Redraw when obstacles update
            } else {
                 console.warn('Map: Received obstacle message with missing or invalid fields.', msg);
            }
        } catch (error) {
            console.error('Map: Error processing Obstacle message:', error);
        }
    }

    // handleCheckpoints(msg) { ... }
    // handleLandmarks(msg) { ... }
    // handleLookahead(msg) { ... }


    destroy() {
        window.removeEventListener('resize', this.resizeHandler);

        // Unsubscribe from all ROS topics
        if (this.robotPoseTopic) this.robotPoseTopic.unsubscribe();
        if (this.pathTopic) this.pathTopic.unsubscribe();
        if (this.traversedPathTopic) this.traversedPathTopic.unsubscribe();
        if (this.lookaheadTopic) this.lookaheadTopic.unsubscribe();
        if (this.obstaclesTopic) this.obstaclesTopic.unsubscribe();
        // if (this.checkpointsTopic) this.checkpointsTopic.unsubscribe(); // Unsubscribe if you add this topic later
        // if (this.landmarksTopic) this.landmarksTopic.unsubscribe(); // Unsubscribe if you add this topic later

        // Clear any remaining dynamic data when the component is destroyed
        this.clearDynamicData();

        // Close ROS connection if this component is responsible for it
        // If your combo plugin manages the main ROS connection, you might not close it here.
        // If this component has its own ROS connection, close it.
        // if (this.ros && this.ros.isConnected) {
        //     this.ros.close();
        // }
        this.ros = null;

        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;

    }
}

// The plugin factory function is now attached to the window object
// window.CostmapMapPlugin = function CostmapMapPlugin(options) { ... }
