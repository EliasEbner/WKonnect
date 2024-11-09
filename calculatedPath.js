const mongoose = require('mongoose');

const pathSchema = new mongoose.Schema({
    index: Number,
    type: String,
    bookings: [
        // {
        //     vonOrt: String,
        //     vonStrasse: String,
        //     vonZeit: Number,
        //     bisOrt: String,
        //     bisStrasse: String,
        //     bisZeit: Number
        // }
    ]
});

const CalculatedPath = mongoose.model('path', pathSchema);

module.exports = CalculatedPath;