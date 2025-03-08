/**
 * Basic implementation of a history and realtime server.
 */
var StaticServer = require('./static-server');
var express = require('express');
var app = express();

// Serve static files
app.use('/', StaticServer());

// Start server
var port = process.env.PORT || 8080;
app.listen(port, function () {
    console.log('Open MCT hosted at http://localhost:' + port);
    console.log('Ensure ROS Bridge is running: roslaunch rosbridge_server rosbridge_websocket.launch');
});
