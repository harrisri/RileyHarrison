const express = require('express');
const bodyParser = require('body-parser');
const json2html = require('json-to-html');
const router = express.Router();
const ds = require('./datastore');
const datastore = ds.datastore;

const BREWERY = "Brewery";
const BEER = "Beer";

router.use(bodyParser.json());

// const base_url = "http://localhost:8080";
const base_url = "https://finalproject-224219.appspot.com";

/*-------------- Begin Helper Functions ------------------*/

function add_self_urls(beer){
    for (var i = 0; i < beer.length; i++) {
        beer[i].self = base_url + "/beer/" + beer[i].id;
    }
    return beer;
}

function get_brewery(id){
    const key = datastore.key([BREWERIES, parseInt(id,10)]);
    return datastore.get(key).then( (results) => {
            result = ds.fromDatastore(results[0]);
            result.self = base_url + "/brewerys/" + result.id;
        	for (var j = 0; j < result.beer.length; j++) {
    			result.beer[j].self = base_url + "/beer/" + result.beer[j].id;
    		}
            return result;
        });
}

function get_num_beers(){
    var q = datastore.createQuery(BEER);
    return datastore.runQuery(q).then( (entities) => {
        return entities[0].map(ds.fromDatastore).length;
    });
}

function put_breweries(id, name, type, length, beer){
    const key = datastore.key([BREWERIES, parseInt(id,10)]);
    const brewery = {"name": name, "type": type, "length": length, "beer": beer};
    return datastore.save({"key":key, "data":brewery});
}
/*-------------- End Helper Functions ------------------*/

/* ------------- Begin Beer Model Functions ------------- */
function post_beer(name, type, alcoholPercentage){
    var key = datastore.key(BEER);
    const new_beer = {"name":name, "type": type, "alcoholPercentage":alcoholPercentage};
    return datastore.insert({"key":key, "data":new_beer}).then(() => {
        return key});
}

async function get_all_beer(req){
    num_beers = await get_num_beers()
    var q = datastore.createQuery(BEER).limit(5);
    const results = {};

    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }

	return datastore.runQuery(q).then( (entities) => {
        results.beer = add_self_urls(entities[0].map(ds.fromDatastore))
        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        results.total_number_of_beers = num_beers;
		return results;
	});
}

function get_beer(id){
    const key = datastore.key([BEER, parseInt(id,10)]);
    return datastore.get(key).then( (results) => {
    		if (results[0] !== undefined) {
	            result = ds.fromDatastore(results[0]);
	            result.self = base_url + "/beer/" + result.id;
	            return result;
    		}
    		return null;
        });
}

function put_beer(id, name, type, alcoholPercentage){
    const key = datastore.key([BEER, parseInt(id,10)]);
    const new_beer = {"name":name, "type": type, "alcoholPercentage":alcoholPercentage};
    return datastore.save({"key":key, "data":new_beer});
}

async function delete_beer(id){
    const key = datastore.key([BEER, parseInt(id,10)]);

    return datastore.delete(key);
}
/* ------------- End Beer Model Functions ------------- */

/* ------------- Begin Beer Controller Functions ------------- */

router.delete('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.put('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.post('/:id', function (req, res){
    res.set('Accept', 'GET, PUT, DELETE');
    res.status(405).end();
});

router.get('/', function(req, res){
    const beer = get_all_beer(req)
    .then( (beer) => {
        var accepts = req.accepts(['application/json', 'text/html']);
        if(!accepts){
            res.status(406).send('Not Acceptable');
        } 
        else if(accepts === 'application/json'){
            res.status(200).json(beer);
        } 
        else if(accepts === 'text/html'){
            res.status(200).send(json2html(beer).slice(1,-1));
        } 
        else { 
            res.status(500).send('Content type got messed up!'); 
        }
    });
});

router.get('/:id', function(req, res){
    const beer = get_beer(req.params.id)
    .then( (beer) => {
        var accepts = req.accepts(['application/json', 'text/html']);
        if(!accepts){
            res.status(406).send('Not Acceptable');
        } 
        else if(beer === null){
            res.status(404).send('Not Found');
        }
        else if(accepts === 'application/json'){
            res.status(200).json(beer);
        } 
        else if(accepts === 'text/html'){
            res.status(200).send(json2html(beer).slice(1,-1));
        } 
        else { 
            res.status(500).send('Content type got messed up!'); 
        }
    });
});

router.post('/', function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send('Server only accepts application/json data.')
    }
    else{
        post_beer(req.body.name, req.body.type, req.body.alcoholPercentage)
    .then( key => {res.status(201).send('{ "id": ' + key.id + ' }')} );
}});

router.put('/:id', function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send('Server only accepts application/json data.')
    }
    else{
        var url = base_url + /beer/ + req.params.id;
        put_beer(req.params.id, req.body.name, req.body.type, req.body.alcoholPercentage)
        .then(res.set('Location', url).status(303).end());
    }

});

router.delete('/:id', function(req, res){
    delete_beer(req.params.id).then(res.status(204).end())
});



/* ------------- End Ship Controller Functions ------------- */

module.exports = router;
