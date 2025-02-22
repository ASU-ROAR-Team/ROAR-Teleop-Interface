function getDictionary() {
    return http.get('/dictionary.json')
        .then(function (result) {
            return result.data;
        });
}
// Add ROS connection at the top
var ros = new ROSLIB.Ros({
    url: 'ws://localhost:9090' // ROS Bridge WebSocket URL
});

// Modified object provider
var objectProvider = {
    get: function (identifier) {
        return getDictionary().then(function (dictionary) {
            if (identifier.key === 'turtlebot') {
                return {
                    identifier: identifier,
                    name: dictionary.name,
                    type: 'folder',
                    location: 'ROOT'
                };
            } else {
                var measurement = dictionary.measurements.filter(function (m) {
                    return m.key === identifier.key;
                })[0];
                return {
                    identifier: identifier,
                    name: measurement.name,
                    type: 'turtlebot.telemetry',
                    telemetry: {
                        values: measurement.values,
                        rosTopic: '/turtle1/cmd_vel' // Add ROS topic reference
                    },
                    location: 'turtlebot.taxonomy:turtlebot'
                };
            }
        });
    }
};

// New telemetry provider for real-time updates
var telemetryProvider = {
    supportsSubscribe: function (domainObject) {
        return domainObject.type === 'turtlebot.telemetry';
    },
    subscribe: function (domainObject, callback) {
        var topic = new ROSLIB.Topic({
            ros: ros,
            name: domainObject.telemetry.rosTopic,
            messageType: 'geometry_msgs/Twist'
        });

        var listener = function (message) {
            var value = domainObject.identifier.key === 'linear.x' ? 
                message.linear.x : 
                message.angular.z;

            callback({
                timestamp: Date.now(),
                value: value
            });
        };

        topic.subscribe(listener);
        return function unsubscribe() {
            topic.unsubscribe(listener);
        };
    }
};

// Modified plugin installation
function TurtlebotPlugin() {
    return function install(openmct) {
        openmct.objects.addRoot({
            namespace: 'turtlebot.taxonomy',
            key: 'turtlebot'
        });
        
        openmct.objects.addProvider('turtlebot.taxonomy', objectProvider);
        openmct.telemetry.addProvider(telemetryProvider);
        
        openmct.types.addType('turtlebot.telemetry', {
            name: 'TurtleBot Telemetry',
            description: 'Real-time TurtleBot velocity measurements',
            cssClass: 'icon-telemetry'
        });
    };
}