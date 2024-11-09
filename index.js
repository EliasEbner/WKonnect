const express = require('express');
const axios = require('axios');
const { ObjectId } = require('mongodb');
const app = express();
const db = require('./db');
const Termin = require('./termin');
const CalculatedPath = require('./calculatedPath');

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // to support URL-encoded bodies
app.use(express.static(__dirname + '/public'));

// URL of your OSRM server (running locally)
const osrmUrl = 'http://192.168.101.39:5000';

app.post('/api/message', (req, res) => {
  const { type, text, textType, info } = req.body; // Add textType here

  // Send message data to the client via Server-Sent Events (SSE)
  if (type === 'newText') {
    app.locals.sseClients.forEach(client => client.write(`data: ${JSON.stringify({
      type,
      text,
      textType // Include textType here
    })}\n\n`));
  } else if (type === 'dataRecognized') {
    app.locals.sseClients.forEach(client => client.write(`data: ${JSON.stringify({
      type,
      info
    })}\n\n`));
  } else if (type === 'resetInfo') {
    app.locals.sseClients.forEach(client => client.write(`data: ${JSON.stringify({ type })}\n\n`));
  }

  res.status(200).send('Message received');
});


app.locals.sseClients = []; // Store active SSE clients

app.get('/events',
  (req,
    res) => {
    res.setHeader('Content-Type',
      'text/event-stream');
    res.setHeader('Cache-Control',
      'no-cache');
    res.setHeader('Connection',
      'keep-alive');
    res.flushHeaders();

    // Add this client to the list of active clients
    app.locals.sseClients.push(res);

    // Remove the client when connection is closed
    req.on('close',
      () => {
        app.locals.sseClients = app.locals.sseClients.filter(client => client !== res);
      });
  });


async function getDistanceMatrix(termins,
  location) {
  let matrix = Array(termins.length + 1).fill(0).map(() => Array(termins.length + 1).fill(0));
  // for (let y = 0; y < termins.size; y++) {
  //   for (let x = y; x < termins.size; x++) {
  //     if (x != y) {
  //       let distance = getDrivingTime(termins[x].vonOrt + ', ' + termins[x].vonStrasse,   termins[y].vonOrt + ', ' + termins[y].vonStrasse);
  //       matrix[x][y] = distance;
  //     }
  //   }
  // }
  for (let i = 0; i < termins.length; ++i) {
    let distance = await getDrivingTime(location,
      termins[i].vonOrt + ', ' + termins[i].vonStrasse, null);
    matrix[i][termins.length] = distance;
    matrix[termins.length][i] = distance;
  }
  return matrix;
}

function calculateToursForDestination(appointments,
  cars,
  distances) {
  // TODO!!!
  // indexes: 0 -> how many of type 0, 
  // 1 -> type 1,
  // 2 -> type 2
  const KTW = [2,
    1,
    1];
  const MFF1 = [4,
    1,
    0];
  const MFF2 = [3,
    2,
    0];
  const PKW = [4,
    0,
    0];

  appointments.sort((a, b) => b.time - a.time);

  for (let a = 0; a < appointments.length; ++a) {
    if (appointments[a].type == 2) {
      let wantedCar = -1;
      let minTime = appointments[a].time;
      for (let c = 0; c < cars.length; ++c) {
        if (cars[c].type != 'KTW') {
          continue;
        }
        if (cars[c].bookings.length == 0 || cars[c].bookings[cars[c].bookings.length - 1].from >= appointments[a].time) {
          wantedCar = c;
          minTime = appointments[a].time;
          break;
        }
        if (wantedCar == -1) {
          wantedCar = c;
          minTime = Math.min(minTime,
            cars[wantedCar].bookings[cars[wantedCar].bookings.length - 1].from);
        } else if (cars[wantedCar].bookings[cars[wantedCar].bookings.length - 1].from < cars[c].bookings[cars[c].bookings.length - 1].from) {
          wantedCar = c;
          minTime = cars[wantedCar].bookings[cars[wantedCar].bookings.length - 1].from;
        }
      }
      cars[wantedCar].bookings.push({
        vonZeit: minTime - distances[appointments[a].index][distances.length - 1],
        bisZeit: minTime,
        vonOrt: appointments[a].bisOrt,
        vonStrasse: appointments[a].bisStrasse,
        bisOrt: appointments[a].vonOrt,
        bisStrasse: appointments[a].vonStrasse
      });
      cars[wantedCar].bookings.push({
        vonZeit: minTime - 2 * distances[appointments[a].index][distances.length - 1] - 15,
        bisZeit: minTime - distances[appointments[a].index][distances.length - 1] - 15,
        vonOrt: appointments[a].vonOrt,
        vonStrasse: appointments[a].vonStrasse,
        bisOrt: appointments[a].bisOrt,
        bisStrasse: appointments[a].bisStrasse
      });
    }
  }

  for (let a = 0; a < appointments.length; ++a) {
    if (appointments[a].type == 1) {
      let wantedCar = -1;
      let minTime = appointments[a].time;
      for (let c = 0; c < cars.length; ++c) {
        if (cars[c].type == 'PKW') {
          continue;
        }
        if (cars[c].bookings.length == 0 || cars[c].bookings[cars[c].bookings.length - 1].from >= appointments[a].time) {
          wantedCar = c;
          minTime = appointments[a].time;
          break;
        }
        if (wantedCar == -1) {
          wantedCar = c;
          minTime = Math.min(minTime,
            cars[wantedCar].bookings[cars[wantedCar].bookings.length - 1].from);
        } else if (cars[wantedCar].bookings[cars[wantedCar].bookings.length - 1].from < cars[c].bookings[cars[c].bookings.length - 1].from) {
          wantedCar = c;
          minTime = cars[wantedCar].bookings[cars[wantedCar].bookings.length - 1].from;
        }
      }
      cars[wantedCar].bookings.push({
        vonZeit: minTime - distances[appointments[a].index][distances.length - 1],
        bisZeit: minTime,
        vonOrt: appointments[a].bisOrt,
        vonStrasse: appointments[a].bisStrasse,
        bisOrt: appointments[a].vonOrt,
        bisStrasse: appointments[a].vonStrasse
      });
      cars[wantedCar].bookings.push({
        vonZeit: minTime - 2 * distances[appointments[a].index][distances.length - 1] - 15,
        bisZeit: minTime - distances[appointments[a].index][distances.length - 1] - 15,
        vonOrt: appointments[a].vonOrt,
        vonStrasse: appointments[a].vonStrasse,
        bisOrt: appointments[a].bisOrt,
        bisStrasse: appointments[a].bisStrasse
      });
    }
  }
  for (let a = 0; a < appointments.length; ++a) {
    if (appointments[a].type == 0) {
      let wantedCar = -1;
      let minTime = appointments[a].time;
      for (let c = 0; c < cars.length; ++c) {
        if (cars[c].bookings.length == 0 || cars[c].bookings[cars[c].bookings.length - 1].from >= appointments[a].time) {
          wantedCar = c;
          minTime = appointments[a].time;
          break;
        }
        if (wantedCar == -1) {
          wantedCar = c;
          minTime = Math.min(minTime,
            cars[c].bookings[cars[c].bookings.length - 1].from);
        } else if (cars[wantedCar].bookings[cars[wantedCar].bookings.length - 1].from < cars[c].bookings[cars[c].bookings.length - 1].from) {
          wantedCar = c;
          minTime = cars[wantedCar].bookings[cars[wantedCar].bookings.length - 1].from;
        }
      }
      cars[wantedCar].bookings.push({
        vonZeit: minTime - distances[appointments[a].index][distances.length - 1],
        bisZeit: minTime,
        vonOrt: appointments[a].bisOrt,
        vonStrasse: appointments[a].bisStrasse,
        bisOrt: appointments[a].vonOrt,
        bisStrasse: appointments[a].vonStrasse
      });
      cars[wantedCar].bookings.push({
        vonZeit: minTime - 2 * distances[appointments[a].index][distances.length - 1] - 15,
        bisZeit: minTime - distances[appointments[a].index][distances.length - 1] - 15,
        vonOrt: appointments[a].vonOrt,
        vonStrasse: appointments[a].vonStrasse,
        bisOrt: appointments[a].bisOrt,
        bisStrasse: appointments[a].bisStrasse
      });
    }
  }
  return cars;
}

app.set('view engine',
  'ejs'); // Set EJS as the view engine
app.set('views',
  __dirname + '/views'); // Set views folder

app.get('/route',
  async (req,
    res) => {
    const { startLat,
      startLon,
      endLat,
      endLon } = req.query;

    if (!startLat || !startLon || !endLat || !endLon) {
      return res.status(400).send('Please provide start and end coordinates');
    }

    try {
      // Make request to OSRM for car routing
      const response = await axios.get(`${osrmUrl}/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false&steps=false`);

      const { routes } = response.data;
      if (routes && routes.length > 0) {
        const { duration } = routes[0]; // Duration in seconds
        res.json({ duration }); // Send duration in seconds as the response
      } else {
        res.status(404).send('No route found');
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('Error querying OSRM');
    }
  });

app.get('/home',
  async (req,
    res) => {
    res.status(200).sendFile(__dirname + '/home.html');
  });

app.get('/calculate', async (req, res) => {
  // const query = { terminZeit: {} };
  // query.terminZeit.$gte = new Date('2020-01-02T00:12');
  // query.terminZeit.$lte = new Date('2020-01-02T23:12');

  // const termins = await Termin.find(query);

  // for (t in termins) {
  //   if (t.vonStrasse in ['BONVICINI',
  //     'BONVICINI-RADIO',
  //     'BONVICINI KLINIK',
  //     'KRANKENHAUS',
  //     'NIERENZENTRUM',
  //     'NZ - NIERENZENTRUM',
  //     'VILLA MELITTA KLINIK',
  //     'VILLA ST. ANNA']) {
  //     let tempOrt = t.vonOrt;
  //     let tempStrasse = t.vonStrasse;
  //     t.vonOrt = t.bisOrt;
  //     t.vonStrasse = t.bisStrasse;
  //     t.bisOrt = tempOrt;
  //     t.bisStrasse = tempStrasse;
  //   }
  // }


  // const groupByLocation = termins.reduce((map,
  //   obj) => {
  //   const { bisOrt, bisStrasse,
  //     ...rest } = obj;
  //   if (!map.has(bisOrt + ', ' + bisStrasse)) map.set(bisOrt + ', ' + bisStrasse,
  //     []);
  //   map.get(bisOrt + ', ' + bisStrasse).push(obj);
  //   return map;
  // },
  //   new Map());

  // let results = [];

  // for (let [key, value] of groupByLocation) {
  //   let cars = [{
  //     index: 0,
  //     type: 'KTW',
  //     bookings: []
  //   }];
  //   let distances = await getDistanceMatrix(value,
  //     key);
  //   const appointments = [];

  //   for (let t = 0; t < value.length; ++t) {
  //     const midnight = new Date(value[t].terminZeit.getFullYear(),
  //       value[t].terminZeit.getMonth(),
  //       value[t].terminZeit.getDate());
  //     const diff = value[t].terminZeit - midnight;

  //     // Convert the difference from milliseconds to minutes
  //     const minutes = Math.floor(diff / 1000 / 60);
  //     let type;
  //     if (value[t].transportArt.toLowerCase() == 'kann gehen')
  //       type = 0;
  //     else if (value[t].transportArt.toLowerCase() == 'stuhl')
  //       type = 1;
  //     else
  //       type = 2;

  //     appointments.push({
  //       time: minutes,
  //       type: type,
  //       index: t,
  //       vonOrt: value[t].vonOrt,
  //       vonStrasse: value[t].vonStrasse,
  //       bisOrt: value[t].bisOrt,
  //       bisStrasse: value[t].bisStrasse
  //     });
  //   }
  //   results.push(calculateToursForDestination(appointments,
  //     cars,
  //     distances));
  // };

  // # index 5 isch es kronkenhaus
  // kronkenhaus isch net im array. isch last index im distances arr
  // types: stehend 0, sitzend 1,      liegend 2
  let appointments = [
    { time: 600, type: 0, index: 0 },
    { time: 660, type: 2, index: 1 },
    { time: 720, type: 0, index: 2 },
    { time: 745, type: 1, index: 3 },
    { time: 720, type: 2, index: 4 }];

  let cars = [{
    index: 0,
    type: 'KTW',
    bookings: []
  }];
  // distances in minutes
  let distances = [[0, 30, 35, 40, 100, 20],
  [30, 0, 50, 30, 100, 15],
  [35, 50, 0, 10, 50, 15],
  [40, 30, 10, 0, 60, 10],
  [100, 100, 50, 60, 0, 65],
  [20, 15, 15, 10, 65, 0]];
  // try {
  //   for (let r of results) {
  //     for (let p of r) {
  //       // console.log(p, '\n\n');
  //       path = new CalculatedPath(p);
  //       await path.save();
  //     }
  //   }
  //   // res.status(201).send('Data stored successfully!');
  // } catch (error) {
  //   console.error(error);
  //   res.status(500).send('Error storing data!');
  // }
  // res.status(200).send(results);
  res.status(200).send(calculateToursForDestination(appointments, cars, distances));
});

app.get('/input',
  async (req,
    res) => {
    res.status(200).sendFile(__dirname + '/input.html');
  });

app.get('/present',
  async (req,
    res) => {
    res.status(200).sendFile(__dirname + '/present.html');
  });

app.get('/see',
  async (req,
    res) => {
    try {
      const termins = await Termin.find(); // Fetch all termin entries from the DB
      res.status(200).render('see',
        { termins }); // Render 'see.ejs' with the data
    } catch (error) {
      console.error(error);
      res.status(500).send('Error retrieving data!');
    }
  });

app.get('/calculated-db',
  async (req,
    res) => {
    try {
      const trips = await CalculatedPath.find(); // Fetch all termin entries from the DB
      res.status(200).render('calculated-db',
        { trips }); // Render 'calculated-db.ejs' with the data
    } catch (error) {
      console.error(error);
      res.status(500).send('Error retrieving data!');
    }
  });



app.get('/manage',
  async (req,
    res) => {
    try {
      const termins = await Termin.find(); // Fetch all termin entries from the DB
      const trips = await CalculatedPath.find(); // Fetch all termin entries from the DB

      res.status(200).render('manage', { trips, termins }); // Render 'calculated-db.ejs' with the data
    } catch (error) {
      console.error(error);
      res.status(500).send('Error retrieving data!');
    }
  });

app.post('/termin',
  async (req,
    res) => {
    try {
      termin = new Termin(req.body);
      termin.terminZeit = new Date(termin.terminZeit);
      await termin.save();

      res.status(201).send('Data stored successfully!');
    } catch (error) {
      console.error(error);
      res.status(500).send('Error storing data!');
    }
  });


app.get('/termin',
  async (req,
    res) => {
    try {
      const {
        terminZeitVon,
        terminZeitBis,
        bisOrt,
      } = req.query;

      const query = {};

      if (terminZeitVon) {
        query.terminZeit = query.terminZeit || {};
        query.terminZeit.$gte = new Date(terminZeitVon);
      }

      if (terminZeitBis) {
        query.terminZeit = query.terminZeit || {};
        query.terminZeit.$lte = new Date(terminZeitBis);
      }

      if (bisOrt) {
        query.bisOrt = bisOrt;
      }

      const termins = await Termin.find(query);
      res.status(200).json(termins);
    } catch (error) {
      console.error(error);
      res.status(500).send('Error retrieving data!');
    }
  });

const port = 3000;
app.listen(port,
  () => {
    console.log(`Server running on port ${port}`);
  });

function convertToMinutes(timeStr) {
  let hours = 0;
  let minutes = 0;

  // Regular expression that matches one or more digits followed by optional space and 'hour/s' (singular or plural)
  if (timeStr.match(/([0-9]+)\s*(?:hour|hours)/)) {
    // remove everything except digits, and convert to integer
    hours = parseInt(timeStr.match(/([0-9]+)\s*(?:hour|hours)/)[0].replace(/^(?:hour|hours)/gi, '').trim());
  }

  // Regular expression that matches one or more digits followed by optional space and 'mins' or 'minutes' (singular or plural)
  if (timeStr.match(/([0-9]+)\s*(?:min|mins|minute|minutes)/)) {
    // remove everything except digits, and convert to integer
    minutes = parseInt(timeStr.match(/([0-9]+)\s*(?:min|mins|minute|minutes)/)[0].replace(/^(?:min|mins|minute|minutes)/gi, '').trim());
  }

  return (hours * 60) + minutes;
}

async function getDrivingTime(origin,
  destination,
  apiKey) {
  const url = 'https://maps.googleapis.com/maps/api/distancematrix/json';
  try {
    const response = await axios.get(url,
      {
        params: {
          origins: origin,
          destinations: destination,
          mode: 'driving',
          key: 'AIzaSyCDMKFjMo4YMZACLXb4cmLqUgfsJvbOUdQ'
        }
      });

    const data = response.data;

    // Check if the request was successful
    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      const drivingTime = data.rows[0].elements[0].duration.text == "0" ? 0 : convertToMinutes(data.rows[0].elements[0].duration.text);
      return drivingTime;
    } else {
      throw new Error('Error fetching driving time from Google Maps API');
    }
  } catch (error) {
    console.error('API request error:',
      error.message);
    throw error;
  }
}


// In the route handler, use `_id` instead of `index`
app.post('/calculated-db/filter', async (req, res) => {
  try {
    const { id } = req.body; // Transport ID from request body
    if (!id) {
      return res.status(400).send('Transport ID is required');
    }

    // Find by `_id` instead of `index` if `_id` is unique and intended for querying
    const trips = await CalculatedPath.find({ _id: ObjectId.createFromHexString(id) });
    if (!trips || trips.length === 0) {
      return res.status(404).send('No trips found with the specified ID');
    }

    res.status(200).json(trips);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error retrieving data');
  }
});


