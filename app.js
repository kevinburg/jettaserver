var express = require('express')
, mongo = require('mongodb')
, monk = require('monk')
, request = require('request')
, https = require('https');
app = express();

app.use(express.bodyParser());

var mongoUri = process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
  'mongodb://localhost/mydb';

var db = monk(mongoUri);

app.get('/addgame/:p1Id/:p2Id/:word', function(req, res) {
  var users = db.get('users');
  var collection = db.get('games');
  object = {
    p1 : {
      id : req.params.p1Id,
      pictureURL : ""
    },
    p2 : {
      id : req.params.p2Id,
      pictureURL : ""
    },
    playing : 2,
    p1Word : req.params.word,
    p2Word : "",
    p1Guesses : [],
    p2Guesses : [],
    gameStatus : 0
  };
  collection.insert(object, {safe : true}, function(err, records){
    res.send(object);
  });
});
 
app.get('/completegame/:id/:word', function(req, res) {
  var collection = db.get('games');
  var query = {_id : req.params.id};
  collection.find(query,{},function(e,docs) {
    game = docs[0];
    collection.update({_id : req.params.id},
		      {$set : {p2Word : req.params.word}});
    newGame = game;
    newGame.p2Word = req.params.word;
    res.send(newGame);
  });
});

app.get('/play/:id/:word/:matched', function(req, res) {
  var collection = db.get('games');
  var query = {_id : req.params.id};
  var game;
  collection.find(query,{},function(e,docs) {
    game = docs[0];
    var newPlaying, newP1Guesses, newP2Guesses;
    newP1Guesses = game.p1Guesses;
    newP2Guesses = game.p2Guesses;
    if (game.playing == 1) {
      newPlaying = 2;
      newP1Guesses.push({word : req.params.word,
			 matched : req.params.matched});
    } else {
      newPlaying = 1;
      newP2Guesses.push({word : req.params.word,
			 matched : req.params.matched});
    }
    collection.update({_id : req.params.id}, 
		      {$set : {playing : newPlaying,
			       p1Guesses : newP1Guesses,
			       p2Guesses : newP2Guesses}});
    newGame = game;
    newGame.playing = newPlaying;
    newGame.p1Guesses = newP1Guesses;
    newGame.p2Guesses = newP2Guesses;
    res.send(newGame);
  });
});

app.post('/login', function(req, res) {
  var id = req.body.id,
  name = req.body.name,
  pictureURL = req.body.pictureURL,
  collection = db.get('users'),
  query = {id : id};
  collection.find(query, {}, function(e,docs) {
    if (docs.length == 0) {
      var object = {id : id, name : name, pictureURL : pictureURL};
      collection.insert(object, {safe : true}, function(err, records) {
	res.send(object);
      })
    } else {
      res.send({'ok' : 'ok'});
    }
  })
});

app.get('/friends/:id/:token', function(req, res) {
  var url = "https://graph.facebook.com/"+req.params.id+
    "/friends?access_token="+req.params.token;
  console.log(url);
  request.get(url, function(err, response, body) {
    var ids = [];
    var info = JSON.parse(body);
    for (var i=0; i<info.data.length; i++) {
      ids[i] = info.data[i].id;
    }
    var collection = db.get('users');
    var query = {"id" : {$in : ids}};
    collection.find(query, {}, function(e,docs) {
      ids = [];
      for (var i=0; i<docs.length; i++) {
	ids[i] = docs[i].id;
      }
      res.send(ids);
    });
  })
});


app.get('/removegame/:id', function(req, res) {
  var collection = db.get('games');
  collection.remove({_id : req.params.id});
  res.send({'ok' : 'ok'});
});

app.get('/endgame/:id/:res', function(req, res) {
  var collection = db.get('games');
  collection.update({_id : req.params.id}, 
		    {$set : {gameStatus : req.params.res,
			     playing : 0}});
});

app.get('/games', function(req, res) {
  var collection = db.get('games');
  collection.find({},{},function(e,docs) {
    res.send(docs);
  });
});

app.get('/game/:id', function(req, res) {
  var collection = db.get('games');
  collection.find({_id : req.params.id},{},function(e,docs) {
    res.send(docs[0]);
  });
});

app.get('/games/:id', function(req, res) {
  var collection = db.get('games');
  var query = {
    $or : [
      {"p1.id" : req.params.id},
      {"p2.id" : req.params.id}
    ]
  };
  collection.find(query,{},function(e,docs) {
    res.send(docs);
  });
});

app.listen(process.env.PORT || 3000);
