var express = require('express')
, mongo = require('mongodb')
, monk = require('monk')
, request = require('request')
, https = require('https')
, apn = require('apn');
app = express();

var pool = [];

var options = { "gateway": "gateway.sandbox.push.apple.com" };
var apnConnection = new apn.Connection(options);
app.use(express.bodyParser());

var mongoUri = process.env.MONGOLAB_URI ||
    process.env.MONGOHQ_URL ||
    'mongodb://localhost/mydb';

var db = monk(mongoUri);

var logError = function(err) {
    console.log("ERROR: ", err)
}

var sendNotification = function (token, data) {
    var device = new apn.Device(token);
    var note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600;
    note.badge = 1;
    note.sound = "ping.aiff";
    if (data[0] == "newgame") {
        note.alert = data[1].p1.name + " challenges you!";
        note.payload = {"id" : data[1]._id};
    }
    else if (data[0] == "newmove") {
        note.alert = "It's your move, bro!";
        note.payload = {"id" : data[1]._id};
    }
    else if (data[0] == "lost") {
        note.alert = "You lost! Loser! You're bad!";
        note.payload = {"id" : data[1]._id};
    }
    else if (data[0] == "poke") {
        note.alert = "Take your turn already!";
        note.payload = {"id" : data[1]._id};
    }
    apnConnection.pushNotification(note, device);
    console.log("notification sent");
}

app.get('/matchmake/:id/:word', function(req, res) {
    var users = db.get('users');
    var games = db.get('games');
    if (pool.length == 0) {
        // Player enters empty queue
        users.findOne({id : req.params.id}, function(err, p1) {
            var object = {
	        p1 : {
	            id : p1.id,
	            name : p1.name,
	            pictureURL : p1.pictureURL
	        },
	        p2 : {},
	        playing : 2,
	        p1Word : req.params.word,
	        p2Word : "",
	        p1Guesses : [],
	        p2Guesses : [],
	        gameStatus : 0,
	        turn : 0
            };
            games.insert(object, {safe : true}, function(err, data) {
	        if (err) logError(err);
	        pool = [data._id];
	        res.send(object);
            });
        });
    } else {
        console.log(pool);
        users.findOne({id : req.params.id}, function(err, p2) {
            id = pool[0];
            pool = [];
            games.findOne({_id : id}, function(err, game) {
	        var newGame = game;
	        newGame.p2 = {
	            id : p2.id,
	            name : p2.name,
	            pictureURL : p2.pictureURL
	        };
	        newGame.p2Word = req.params.word;
	        games.update({_id : id},
		             {$set : {p2 : newGame.p2,
			              p2Word : newGame.p2Word}
		             });
	        res.send(newGame);
            });
        });
    }     
});

app.get('/addgame/:p1Id/:p2Id/:word', function(req, res) {
    var users = db.get('users');
    var collection = db.get('games');
    users.findOne({id : req.params.p1Id}, function(err, p1) {
        if (err) logError(err)
        users.findOne({id : req.params.p2Id}, function(err, p2) {
            if (err) logError(err)
            object = {
	        p1 : {
	            id : p1.id,
	            name : p1.name,
	            pictureURL : p1.pictureURL
	        },
	        p2 : {
	            id : p2.id,
	            name : p2.name,
	            pictureURL : p2.pictureURL
	        },
	        playing : 2,
	        p1Word : req.params.word,
	        p2Word : "",
	        p1Guesses : [],
	        p2Guesses : [],
	        gameStatus : 0,
	        turn : 0
            };
            collection.insert(object, {safe : true}, function(err, data){
	        if (err) logError(err)
	        sendNotification(p2.deviceToken, ["newgame", data])
	        res.send(object);
            });
        });
    });
    users.update({id : req.params.p1Id},
	         {$set : {last : new Date().toISOString().replace(/T/, ' ')
			  .replace(/\..+/, '')
		         },
	          $inc : {turnsPlayed : 1}});
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

app.get('/poke/:id', function(req, res) {
    var collection = db.get('games');
    var users = db.get('users');
    var query = {_id : req.params.id};
    collection.findOne({_id : req.params.id}, function(e, game) {
        var playerId;
        if (game.playing == 1) {
            playerId = game.p1.id;
        } else {
            playerId = game.p2.id;
        }
        users.findOne({_id : playerId}, function(e, player) {
            sendNotification(player.deviceToken, ["poke", game]);
        });
    });
    res.send({'ok' : 'ok'});
});

app.get('/play/:id/:word/:matched/:turn', function(req, res) {
    var collection = db.get('games');
    var users = db.get('users');
    var query = {_id : req.params.id};
    var game;
    collection.find(query,{},function(e,docs) {
        game = docs[0];
        if (req.params.turn != game.turn) {
            console.log("Duplicate turn received. Ignoring.");
            res.send(game);
        } else {
            var newPlaying, newP1Guesses, newP2Guesses;
            newP1Guesses = game.p1Guesses;
            newP2Guesses = game.p2Guesses;
            if (game.playing == 1) {
	        newPlaying = 2;
	        newP1Guesses.unshift({word : req.params.word,
			              matched : req.params.matched});
            } else {
	        newPlaying = 1;
	        newP2Guesses.unshift({word : req.params.word,
			              matched : req.params.matched});
            }
            collection.update({_id : req.params.id}, 
			      {$set : {playing : newPlaying,
				       p1Guesses : newP1Guesses,
				       p2Guesses : newP2Guesses,
				       turn : game.turn+1
				      }
			      });
            var playerID
            if (newPlaying == 1) {
	        playerID = game.p1.id;
            } else {
	        playerID = game.p2.id
            }
            users.findOne({id : playerID}, function(err, player) {
	        sendNotification(player.deviceToken, ["newmove", game])
            });
            users.update({id : playerID},
		         {$set : {last : new Date().toISOString().replace(/T/, ' ')
			          .replace(/\..+/, '')
			         },
		          $inc : {turnsPlayed : 1}});
            newGame = game;
            newGame.playing = newPlaying;
            newGame.p1Guesses = newP1Guesses;
            newGame.p2Guesses = newP2Guesses;
            newGame.turn = game.turn+1;
            res.send(newGame);
        }
    });
});

app.post('/login', function(req, res) {
    var id = req.body.id,
    name = req.body.name,
    pictureURL = req.body.pictureURL,
    deviceToken = req.body.deviceToken
    collection = db.get('users'),
    query = {id : id};
    collection.find(query, {}, function(e,docs) {
        if (docs.length == 0) {
            var object = {id : id, name : name, pictureURL : pictureURL, deviceToken : deviceToken,
		          wins : 0, losses: 0, turnsPlayed: 0,
		          joined: new Date().toISOString().replace(/T/, ' ')
		          .replace(/\..+/, '').split(" ")[0],
		          last : "No moves."};
            collection.insert(object, {safe : true}, function(err, records) {
	        res.send(object);
            })
        } else {
            collection.update({_id : req.body.id}, 
			      {$set : {deviceToken : deviceToken}});
            res.send(docs[0]);
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
	        var object = {
	            id : docs[i].id,
	            win : docs[i].wins,
	            loss : docs[i].losses
	        };
	        ids[i] = object;
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
    collection.findOne({_id : req.params.id}, function(err, doc) {
        var users = db.get('users');
        var pid;
        if (req.params.res == 1) {
            users.update({id : doc.p1.id},
		         {$inc : {wins : 1}});
            users.update({id : doc.p2.id},
		         {$inc : {losses : 1}});
            pid = doc.p2.id;
        } else {
            users.update({id : doc.p2.id},
		         {$inc : {wins : 1}});
            users.update({id : doc.p1.id},
		         {$inc : {losses : 1}});
            pid = doc.p1.id;
        }
        users.findOne({id : pid}, function(err, player) {
            sendNotification(player.deviceToken, ["lost", doc])
        });
        res.send(doc);
    });
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
