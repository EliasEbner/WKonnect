const mongoose = require('mongoose');

const url = 'mongodb://localhost:27017/';
const dbName = 'WKonnect';

mongoose.connect(`${url}${dbName}`);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));

db.once('open', function () {
    console.log('Connected to MongoDB');
});

module.exports = db;