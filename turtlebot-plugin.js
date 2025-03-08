function TurtlebotPlugin() {
    return function install(openmct) {
        const ros = new ROSLIB.Ros({ url: 'ws://localhost:9090' });
        // ROS Connection Event Handlers
        ros.on('connection', () => {
            console.log('[ROS] Successfully connected to ROS Bridge Server at ws://localhost:9090');
            console.log('[ROS] Connection State:', ros.isConnected ? 'Connected' : 'Disconnected');
        });

        ros.on('error', (error) => {
            console.error('[ROS] Connection Error:', error);
        });

        ros.on('close', () => {
            console.warn('[ROS] Connection closed. Reconnecting in 3 seconds...');
            setTimeout(() => ros.connect('ws://localhost:9090'), 3000);
        });


                // 1. Define Telemetry Objects First
                const TELEMETRY_OBJECTS = {
                    'linear.x': {
                        name: 'Linear Velocity (X)',
                        key: 'linear.x',
                        units: 'm/s'
                    },
                    'angular.z': {
                        name: 'Angular Velocity (Z)',
                        key: 'angular.z',
                        units: 'rad/s'
                    }
                };
        
                // 2. Object Provider with Composition
                const objectProvider = {
                    get: (identifier) => {
                        console.log('[OpenMCT] Fetching:', identifier);
        
                        // Handle Rover Folder
                        if (identifier.key === 'rover') {
                            return Promise.resolve({
                                identifier: {
                                    namespace: 'rover.namespace',
                                    key: 'rover'
                                },
                                name: 'Rover',
                                type: 'folder',
                                location: 'ROOT',
                                composition: Object.keys(TELEMETRY_OBJECTS).map(key => ({
                                    namespace: 'rover.namespace',
                                    key: key
                                })),
                                persisted: true
                            });
                        }
        
                        // Handle Telemetry Objects
                        if (TELEMETRY_OBJECTS[identifier.key]) {
                            const objConfig = TELEMETRY_OBJECTS[identifier.key];
                            return Promise.resolve({
                                identifier: {
                                    namespace: 'rover.namespace',
                                    key: identifier.key
                                },
                                name: objConfig.name,
                                type: 'rover.telemetry',
                                telemetry: {
                                    values: [
                                        {
                                            key: 'utc',
                                            name: 'Timestamp',
                                            source: 'timestamp',
                                            format: 'utc',
                                            hints: { domain: 1 }
                                        },
                                        {
                                            key: 'value',
                                            name: 'Value',
                                            units: objConfig.units,
                                            hints: { range: 1 }
                                        }
                                    ]
                                },
                                location: {
                                    namespace: 'rover.namespace',
                                    key: 'rover'
                                }
                            });
                        }  
                        return Promise.reject(new Error('Unknown identifier'));
                    }
                };

        // 2. Register Provider and Root
        openmct.objects.addProvider('rover.namespace', objectProvider);
        openmct.objects.addRoot({
            namespace: 'rover.namespace',
            key: 'rover'
        });

        // 3. Telemetry Provider (keep existing)
        openmct.telemetry.addProvider({
            supportsRequest: (domainObject) => false, // Disable historical requests
            
            supportsSubscribe: (domainObject) => {
                console.log('[PROVIDER] Checking subscription support for:', domainObject.identifier.key);
                return domainObject.type === 'rover.telemetry';
            },
            subscribe: (domainObject, callback) => {
                console.log('[PROVIDER] Subscribing to:', domainObject.identifier.key); 
                
                const topic = new ROSLIB.Topic({
                    ros: ros,
                    name: '/turtle1/cmd_vel',
                    messageType: 'geometry_msgs/Twist'
                });

                const handler = (message) => {
                    const value = domainObject.identifier.key === 'linear.x' 
                        ? message.linear.x 
                        : message.angular.z;
                    // Add console logging
                    console.log(`[TELEMETRY] ${domainObject.identifier.key}:`, value);
                    
                    callback({
                        timestamp: Date.now(),  // Domain value
                        value: value,      // Range value 
                        id: domainObject.identifier.key
                    });
                };

                topic.subscribe(handler);
                return () => topic.unsubscribe(handler);
            },
            request: (domainObject, options) => Promise.resolve([]), // Empty historical
        });

        // 4. Type Registration (keep existing)
        openmct.types.addType('rover.telemetry', {
            name: 'Rover Telemetry',
            description: 'Real-time velocity measurements',
            cssClass: 'icon-telemetry',
        });
    };
}