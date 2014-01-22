var express = require('express')
, mongo = require('mongodb');
app = express();

var mongoUri = process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
  'mongodb://localhost/mydb';

mongo.Db.connect(mongoUri, function (err, db) {
  db.collection('mydocs', function(er, collection) {
    collection.insert({'mykey': 'myvalue'}, {safe: true}, function(er,rs) {
    });
  });
});

app.get('/games/:id', function(req, res){
    res.send(
      {'games': ['first game',
		 'second game']
      }
    );
});

app.listen(process.env.PORT || 3000);
