'use strict'

// Application Dependencies
const express = require('express')
const cors = require('cors')
const superagent = require('superagent')
const pg = require('pg');

// Load env vars;
require('dotenv').config()

const PORT = process.env.PORT || 3000

// App
const app = express()

app.use(cors())

// Postgres
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

// Error handling
function handleError (err) {
  // res.status(500).send('Sorry something went wrong!')
  console.error(err);
}

// Routes
app.get('/location', getLocation)
app.get('/weather', getWeather)
app.get('/yelp', getYelp);
app.get('/movies', getMovies);


// Handlers
function getLocation (req, res) {
  Location.lookup({
    tableNmae: Location.tableName,

    query: req.query.data,

    cacheHit: function(result) {
      res.send(result.rows[0]);
    },

    cacheMiss: function() {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${this.query}&key=${process.env.GEOCODE_API_KEY}`;

      return superagent.get(url)
        .then(result => {
          const location = new Location(this.query, result.body.results[0]);
          location.save()
            .then(location => res.send(location));
        })
        .catch(err => handleError(err));
    }
  })
}

function getWeather (req, res) {
  return searchForWeather(req.query.data)
    .then(weatherData => {
      res.send(weatherData);
    });
}

function getYelp(req, res) {
  return searchYelp(req.query.data)
    .then(yelpData => {
      res.send(yelpData);
    });
}

function getMovies(req, res) {
  return searchMovies(req.query.data)
    .then(moviesData => {
      res.send(moviesData);
    });
}

// Models
function Location (query, location) {
  this.tableName = 'locations';
  this.search_query = query
  this.formatted_query = location.formatted_address
  this.latitude = location.geometry.location.lat
  this.longitude = location.geometry.location.lng
}
Location.lookup = location => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1`;
  const values = [location.query];

  return client.query(SQL, values)
    .then(result => {
      if(result.rowCount > 0) {
        location.cacheHit(result);
      } else {
        location.cacheMiss();
      }
    })
    .catch(err => handleError(err));
}
Location.prototype = {
  save: function() {
    const SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;`;
    const values = [this.search_query, this.formatted_query, this.latitude, this.longitude];

    return client.query(SQL, values)
      .then(result => {
        this.id = result.rows[0].id;
        return this;
      });
  }
}

function Daily (day) {
  this.forecast = day.summary
  this.time = new Date(day.time * 1000).toDateString()
}

function Yelp(business) {
  this.name = business.name;
  this.image_url = business.image_url;
  this.price = business.price;
  this.rating = business.rating;
  this.url = business.url;
}

function Movie(movie) {
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  if (movie.poster_path) {
    this.image_url = `http://image.tmdb.org/t/p/w200_and_h300_bestv2${movie.poster_path}`;
  } else {
    this.image_url = null;
  }
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
}

// Search Functions

function searchForWeather(query) {
  const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${query.latitude},${query.longitude}`;

  return superagent.get(url)
    .then(weatherData => {
      return weatherData.body.daily.data.map(day => new Daily(day));
    })
    .catch(err => console.error(err));
}

function searchYelp(query) {
  const url = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${query.latitude}&longitude=${query.longitude}`;
  return superagent.get(url)  
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(yelpData => {
      return yelpData.body.businesses.map(business => new Yelp(business));
    });
}

function searchMovies(query) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${query.search_query}`;
  return superagent.get(url)
    .then(moviesData => {
      return moviesData.body.results.map(movie => new Movie(movie));
    })
}

// Bad path
// app.get('/*', function(req, res) {
//   res.status(404).send('You are in the wrong place');
// });

// Listen
app.listen(PORT, () => {
  console.log(`Listening on port: ${PORT}`)
 }
)
