var express = require('express')
, mongo = require('mongodb')
, monk = require('monk');
app = express();

app.use(express.bodyParser());

var mongoUri = process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
  'mongodb://localhost/mydb';

var db = monk(mongoUri);

app.get('/addgame/:p1Id/:p2Id/:word', function(req, res) {
  var collection = db.get('games');
  object = {
    p1Id : req.params.p1Id,
    p2Id : req.params.p2Id,
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
 
app.get('/play/:id/:word', function(req, res) {
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
      newP1Guesses.push(req.params.word);
    } else {
      newPlaying = 1;
      newP2Guesses.push(req.params.word);
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
  query = {_id : id};
  collection.find(query, {}, function(e,docs) {
    if (docs.length == 0) {
      var object = {id : id, name : name, pictureURL : pictureURL};
      collection.insert(object, {safe : true}, function(err, records) {
	res.send(object);
      })
    } else {
      res.send({ok : ok});
    }
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
		    {$set : {gameStatus : req.params.res}});
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
      {p1Id : req.params.id},
      {p2Id : req.params.id}
    ]
  };
  collection.find(query,{},function(e,docs) {
    res.send(docs);
  });
});

app.listen(process.env.PORT || 3000);
