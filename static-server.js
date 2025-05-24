var express = require('express');

function StaticServer() {
    const router = express.Router();
    
    // Serve project root files (index.html, turtlebot-plugin.js)
    router.use('/', express.static(__dirname));
    
    // Serve OpenMCT assets from node_modules
    router.use('/node_modules', express.static(__dirname + '/node_modules'));
// Serve Image assets from images directory
    router.use('/images', express.static(__dirname + '/images'));
    // Serve Image assets from images directory
    
    
    return router;
}

module.exports = StaticServer;
