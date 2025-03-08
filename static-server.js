var express = require('express');

function StaticServer() {
    const router = express.Router();
    
    // Serve project root files (index.html, turtlebot-plugin.js)
    router.use('/', express.static(__dirname));
    
    // Serve OpenMCT assets from node_modules
    router.use('/node_modules', express.static(__dirname + '/node_modules'));
    
    return router;
}

module.exports = StaticServer;
