// app.js

var cfenv = require( 'cfenv' );
var express = require( 'express' );
var basicAuth = require( 'basic-auth-connect' );
var bodyParser = require( 'body-parser' );
var fs = require( 'fs' );
var multer = require( 'multer' );
var uuidv1 = require( 'uuid/v1' );
var app = express();

var settings = require( './settings' );
var appEnv = cfenv.getAppEnv();

//. https://www.npmjs.com/package/@cloudant/cloudant
var Cloudantlib = require( '@cloudant/cloudant' );
var cloudant = null;
var db = null;

if( !settings.db_host ){
  cloudant = Cloudantlib( { account: settings.db_username, password: settings.db_password } );
}else{
  var url = settings.db_protocol + '://';
  if( settings.db_username && settings.db_password ){
    url += ( settings.db_username + ':' + settings.db_password + '@' );
  }
  url += ( settings.db_host + ':' + settings.db_port );
  cloudant = Cloudantlib( url );
}

if( cloudant ){
  cloudant.db.get( settings.db_name, function( err, body ){
    if( err ){
      if( err.statusCode == 404 ){
        cloudant.db.create( settings.db_name, function( err, body ){
          if( err ){
            db = null;
          }else{
            db = cloudant.db.use( settings.db_name );
            createDesignDocument();
          }
        });
      }else{
        db = cloudant.db.use( settings.db_name );
        createDesignDocument();
      }
    }else{
      db = cloudant.db.use( settings.db_name );
      createDesignDocument();
    }
  });
}

/*
app.all( '/*', basicAuth( function( user, pass ){
  return ( user && user === pass );
}));
*/

app.use( multer( { dest: './tmp/' } ).single( 'file' ) );
app.set( 'superSecret', settings.superSecret );
app.use( express.static( __dirname + '/public' ) );
app.use( bodyParser.urlencoded( { extended: true, limit: '10mb' } ) );
//app.use( bodyParser.urlencoded() );
app.use( bodyParser.json() );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );


app.get( '/', function( req, res ){
  var db_url = settings.db_url + '/' + settings.db_name;
  res.render( 'index', { db_url: db_url, db_name: settings.db_name } );
});


app.post( '/doc', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /doc' );
  //console.log( req.body );
  if( db ){
    if( req.body._id ){
      if( req.body._rev && req.body.created ){
        //. 更新
        var doc = req.body;
        doc.updated = ( new Date() ).getTime();

        db.insert( doc, function( err, body ){
          if( err ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
            res.end();
          }else{
            res.write( JSON.stringify( { status: true, doc: body, message: 'document is created.' }, 2, null ) );
            res.end();
          }
        });
      }else{
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: 'both _rev and created need to be specified for update.' }, 2, null ) );
        res.end();
      }
    }else{
      //. 作成
      var doc = req.body;
      doc.created = doc.updated = ( new Date() ).getTime();

      db.insert( doc, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          res.write( JSON.stringify( { status: true, doc: body, message: 'document is created.' }, 2, null ) );
          res.end();
        }
      });
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.get( '/doc/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /doc/' + id );
  if( db ){
    db.get( id, { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        res.write( JSON.stringify( { status: true, doc: body }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.delete( '/doc/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'DELETE /doc/' + id );
  if( db ){
    db.get( id, function( err, data ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        //console.log( data );
        db.destroy( id, data._rev, function( err, body ){
          if( err ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
            res.end();
          }else{
            res.write( JSON.stringify( { status: true }, 2, null ) );
            res.end();
          }
        });
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});


/*
 You need to create search index 'design/search' with name 'newSearch' in your Cloudant DB before executing this API.
 */
app.get( '/search', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'GET /search' );
  if( db ){
    var q = req.query.q;
    if( q ){
      db.search( 'library', 'newSearch', { q: q, include_docs: true }, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          res.write( JSON.stringify( { status: true, result: body }, 2, null ) );
          res.end();
        }
      });
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: 'parameter: q is required.' }, 2, null ) );
      res.end();
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.get( '/query', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var username = req.query.username ? req.query.username : '';
  var limit = req.query.limit ? parseInt( req.query.limit ) : 0;
  var offset = req.query.offset ? parseInt( req.query.offset ) : 0;
  console.log( 'GET /query?user_id=' + user_id + '&limit=' + limit + '&offset=' + offset );

  if( db ){
    if( username ){
      var option = { selector: { username: username } };
      if( limit ){ option['limit'] = limit; }
      if( offset ){ option['skip'] = offset; }
      db.find( option, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          var docs = [];
          body.docs.forEach( function( doc ){
            if( doc._id.indexOf( '_' ) !== 0 ){
              docs.push( doc );
            }
          });

          var result = { status: true, docs: docs };
          res.write( JSON.stringify( result, 2, null ) );
          res.end();
        }
      });
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: 'parameter: username is required.' }, 2, null ) );
      res.end();
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});


app.get( '/dbinfo', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'GET /dbinfo' );
  if( db ){
    db.info( function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        if( body.update_seq ){
          delete body.update_seq;
        }
        res.write( JSON.stringify( { status: true, info: body }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});


function createDesignDocument(){
  var search_index_function = 'function (doc) { index( "default", doc._id ); }';
  if( settings.search_fields ){
    search_index_function = 'function (doc) { index( "default", ' + settings.search_fields + '.join( " " ) ); }';
  }

  //. デザインドキュメント作成
  var design_doc_doc = {
    _id: "_design/library",
    language: "javascript",
    views: {
      bycreated: {
        map: "function (doc) { if( doc.created ){ emit(doc.created, doc); } }"
      },
      byupdated: {
        map: "function (doc) { if( doc.updated ){ emit(doc.updated, doc); } }"
      }
    },
    indexes: {
      newSearch: {
        "analyzer": settings.search_analyzer,
        "index": search_index_function
      }
    }
  };
  db.insert( design_doc_doc, function( err, body ){
    if( err ){
      console.log( "db init(1): err" );
      console.log( err );
    }else{
      console.log( "db init(1): " );
      console.log( body );

      //. クエリーインデックス作成
      var query_index_username = {
        _id: "_design/username-index",
        language: "query",
        views: {
          "username-index": {
            map: {
              fields: { "username": "asc" },
              partial_filter_selector: {}
            },
            reduce: "_count",
            options: {
              def: {
                fields: [ "username" ]
              }
            }
          }
        }
      };
      db.insert( query_index_username, function( err, body ){
        if( err ){
          console.log( "db init(2): err" );
          console.log( err );
        }else{
          console.log( "db init(2): " );
          console.log( body );
        }
      });
    }
  });
}

var port = settings.app_port || appEnv.port || 3000;
app.listen( port );
console.log( 'server started on ' + port );
