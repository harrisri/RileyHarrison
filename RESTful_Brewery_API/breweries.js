const express = require('express');
const bodyParser = require('body-parser');
const json2html = require('json-to-html');
const router = express.Router();
const login = express.Router();

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const ds = require('./datastore');
const datastore = ds.datastore;

const BREWERY = "Brewery";
const BEER = "Beer";

router.use(bodyParser.json());

// const base_url = "http://localhost:8080";
const base_url = "https://finalproject-224219.appspot.com";

/*-------------- Begin Helper Functions ------------------*/
const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri:'https://finalproject-224219.auth0.com/.well-known/jwks.json'
    }),
  
    // Validate the audience and the issuer.
    issuer: 'https://finalproject-224219.auth0.com/',
    algorithms: ['RS256']
});

function add_self_urls(breweries){
    for (var i = 0; i < breweries.length; i++) {
        breweries[i].self = base_url + "/breweries/" + breweries[i].id;
        if (breweries[i].beer != undefined) {
        	for (var j = 0; j < breweries[i].beer.length; j++) {
    		  //breweries[i].beer[j].self = base_url + "/beer/" + breweries[i].beer[j].id;
    		}
        }

    }
    return breweries;
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
/*-------------- End Helper Functions ------------------*/

/* ------------- Begin Brewery Model Functions ------------- */
function post_brewery(name, yearFounded, location, owner){
    var key = datastore.key(BREWERY);
    const new_brewery = {"name": name, "yearFounded": yearFounded, "location": location, "beer": [], "owner":owner};
    return datastore.insert({"key":key, "data":new_brewery}).then(() => {
        return key});
}

function get_num_breweries(){
    var q = datastore.createQuery(BREWERY);
    return datastore.runQuery(q).then( (entities) => {
        return entities[0].map(ds.fromDatastore).length;
    });
}

async function get_breweries(req){
    num_breweries = await get_num_breweries();
    var q = datastore.createQuery(BREWERY).limit(5);
    const results = {};

    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }

	return datastore.runQuery(q).then( (entities) => {
        results.breweries = add_self_urls(entities[0].map(ds.fromDatastore))
        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        results.total_number_of_breweries = num_breweries;
		return results;
	});
}

function get_brewery(id){
    const key = datastore.key([BREWERY, parseInt(id,10)]);
    return datastore.get(key).then( (results) => {
    	if (results[0] != undefined) {
    		result = ds.fromDatastore(results[0]);
            result.self = base_url + "/breweries/" + result.id;
            if (result.beer != undefined) {
            	for (var j = 0; j < result.beer.length; j++) {
                    result.beer[j].self = base_url + "/beer/" + result.beer[j].id;
    			}
            }
            return result;
    	}
    	return null;
        });
}

function put_breweries(id, name, yearFounded, location, beer,owner){
    const key = datastore.key([BREWERY, parseInt(id,10)]);
    const brewery = {"name": name, "yearFounded": yearFounded, "location": location, "beer":beer, "owner":owner};
    return datastore.save({"key":key, "data":brewery});
}

function get_beer_on_brewery(req){
    const results = {};
	var q = datastore.createQuery(BEER)
	.filter('carrier.id','=',req.params.id)
	.limit(3);

    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }

	return datastore.runQuery(q).then( (entities) => {
        results.beer = entities[0].map(ds.fromDatastore)
        //results.breweries = entities[0].map(ds.fromDatastore);
        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
            results.next = req.protocol + "://" + req.get("host") + "/breweries/" + req.params.id + "/beer" + "?cursor=" + entities[1].endCursor;
        }
    	for (var j = 0; j < results.beer.length; j++) {
			results.beer[j].self = base_url + "/beer/" + results.beer[j].id;
		}
		return results;
	});

}

async function addBeer(req, brewery_id, beer_id){
    brewery = await get_brewery(brewery_id);
    breweries = await get_breweries(req);
    breweries = breweries.breweries;
    beer = await get_beer(beer_id);

    var success = true;

    for (var i = 0; i < breweries.length; i++) {
        if (breweries[i].beer) {
            for (var j = 0; j < breweries[i].beer.length; j++) {
                if (breweries[i].beer[j].id == beer_id) {
                    success = false;
                    break;
                }
            }
        }
        if (!success) {
            break;
        }
    }
    if (success){
        if (!brewery.beer) {
            brewery.beer = [];
        }
        brewery.beer.push(beer);
    	put_breweries(brewery.id, brewery.name, brewery.yearFounded, brewery.loacation, brewery.beer, brewery.owner).then();
    }

    return success;
}


async function removeBeer(brewery_id, beer_id){
    brewery = await get_brewery(brewery_id);
    beer = await get_beer(beer_id);

    var success = false;
    for (var i = 0; i < brewery.beer.length; i++) {
        if (brewery.beer[i].id == beer_id) {
            success = true;
            break;
        }
    }

    if (success) {
        brewery.beer.splice(i);
        put_breweries(brewery.id, brewery.name, brewery.yearFounded, brewery.loacation, brewery.beer, brewery.owner).then();
    }
    return success;
}

async function delete_brewery(id){
    const key = datastore.key([BREWERY, parseInt(id,10)]);
    return datastore.delete(key);
}
/* ------------- End Brewery Model Functions ------------- */


/* ------------- Begin Brewery Controller Functions ------------- */

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
    const breweries = get_breweries(req)
    .then( (breweries) => {
        var accepts = req.accepts(['application/json', 'text/html']);
        if(!accepts){
            res.status(406).send('Not Acceptable');
        } 
        else if(accepts === 'application/json'){
            res.status(200).json(breweries);
        } 
        else if(accepts === 'text/html'){
            res.status(200).send(json2html(breweries).slice(1,-1));
        } 
        else { 
            res.status(500).send('Content type got messed up!'); 
        }
    });
});

router.get('/:id', function(req, res){
    const brewery = get_brewery(req.params.id)
    .then( (brewery) => {
        var accepts = req.accepts(['application/json', 'text/html']);
        if(!accepts){
            res.status(406).send('Not Acceptable');
        } 
        else if(brewery === null){
            res.status(404).send('Not Found');
        }
        else if(accepts === 'application/json'){
            res.status(200).json(brewery);
        } 
        else if(accepts === 'text/html'){
            res.status(200).send(json2html(brewery).slice(1,-1));
        } 
        else { 
            res.status(500).send('Content type got messed up!'); 
        }
    });
});

router.post('/', checkJwt, function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send('Server only accepts application/json data.')
    }
    else{
        post_brewery(req.body.name, req.body.yearFounded, req.body.location, req.user.name)
        .then( key => {
            res.location(req.protocol + "://" + req.get('host') + req.baseUrl + '/' + key.id);
            res.status(201).send('{ "id": ' + key.id + ' }')
            } 
        );
    }
});

router.put('/:id', checkJwt, function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send('Server only accepts application/json data.')
    }
    else{
        const brewery = get_brewery(req.params.id).then((brewery) =>{
            if (brewery.owner === req.user.name) {
                var url = base_url + /breweries/ + req.params.id;
                put_breweries(req.params.id, req.body.name, req.body.yearFounded, req.body.location, req.body.beer, req.user.name)
                .then(res.set('Location', url).status(303).end());
            }
            else{
                res.status(403).send('Forbidden');
            }
        })

    }
});

router.put('/:id/beer/:beer_id', checkJwt, function(req, res){
    const brewery = get_brewery(req.params.id).then((brewery) =>{
        if (brewery.owner === req.user.name) {
            const success = addBeer(req,req.params.id, req.params.beer_id)
            .then( (success) => {
                if (success){
                    var url = base_url + /breweries/ + req.params.id;
                    res.set('Location', url).status(303).end();
                }
                else{
                    res.status(403).send("Forbidden: Beer already belongs to a brewery.")
                }
            })
        }
        else{
            res.status(403).send('Forbidden');
        }
    });
});

router.delete('/:id/beer/:beer_id', checkJwt, function(req, res){
    const brewery = get_brewery(req.params.id).then((brewery) =>{
        if (brewery.owner === req.user.name) {
            const success = removeBeer(req.params.id, req.params.beer_id)
            .then( (success) => {
                if (success){
                    var url = base_url + /breweries/ + req.params.id;
                    res.set('Location', url).status(303).end();
                }
                else{
                    res.status(403).send("Forbidden: Beer not in this brewery.")
                }
            })
        }
        else{
            res.status(403).send('Forbidden');
        }
    });
});

router.delete('/:id/', checkJwt, function(req, res){
    const brewery = get_brewery(req.params.id).then((brewery) =>{
        if (brewery.owner === req.user.name) {
            delete_brewery(req.params.id).then(res.status(204).end())
        }
        else{
            res.status(403).send('Forbidden');
        }
    });
});

//this is for testing purposes to quickly delete all breweries.
router.delete('/unsecure/:id', function(req, res){
    delete_brewery(req.params.id).then(res.status(204).end())
});




/* ------------- End Brewery Controller Functions ------------- */

module.exports = router;
