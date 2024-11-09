const mongoose = require('mongoose');

const terminSchema = new mongoose.Schema({
    vonOrt: String,
    vonStrasse: String,
    bisOrt: String,
    bisStrasse: String,
    transportArt: String,
    name: String,
    terminZeit: Date,
});

const Termin = mongoose.model('Termin', terminSchema);

module.exports = Termin;