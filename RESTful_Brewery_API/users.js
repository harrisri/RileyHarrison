const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const request = require('request');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
router.use(bodyParser.json());

const base_url = "https://finalproject-224219.auth0.com";
const CLIENT_ID = 'zLIKvEx6wSqMtE1y4R3JTiWud2hd6stS'
const CLIENT_SECRET = '31uYFNbjDQ00a3K0ngTqzF9gUA8N1AGKfjHgYnTSTMdGN6EYTpix2Xodk2vgZfd0'

/* ------------- Begin Beer Controller Functions ------------- */

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


//Get a token that can be used for creating users.
function getToken(){
    var options = { 
        method: 'POST',
        url: 'https://finalproject-224219.auth0.com/oauth/token',
        headers: { 'content-type': 'application/json' },
        body: { 
            grant_type: 'client_credentials',
            client_id: 'zLIKvEx6wSqMtE1y4R3JTiWud2hd6stS',
            client_secret: CLIENT_SECRET,
            audience: 'https://finalproject-224219.auth0.com/api/v2/' 
        },
        json: true 
    };
    
    return new Promise(function(resolve, reject) {
        request(options, function(error, response, body) {
            if (error) throw new Error(error);
            token = body.access_token;
            resolve(token);
        });
    });
}

//CREATE USER
router.post('/', async function(req,res){
    const token = await getToken()
    const username = req.body.username;
    const password = req.body.password;

    var options = { 
        method: 'POST',
        url: base_url + '/api/v2/users',
        headers: { 
            'content-type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body:{ 
            connection: "Username-Password-Authentication",
            email: username, 
            password: password,
            email_verified: false, 
            verify_email: false, 
            app_metadata: {},
        },
        json: true 
    };

    request(options, (error, response, body) => {
        if (error){
            res.status(500).send(error);
        } else {
            res.send(body);
        }
    });
});

//DELETE USER
router.delete('/:username', checkJwt, async function(req, res){
    if (req.user.name === req.params.username) {
        const token = await getToken()
        var options = {
            headers: { 
                'Authorization': 'Bearer ' + token
            }, 
            method: 'DELETE',
            url: 'https://finalproject-224219.auth0.com/api/v2/users/' + req.user.sub,
            audience: 'https://finalproject-224219.auth0.com/api/v2/',
        };
        request(options, (error, response, body) => {
            if (error){
                res.status(500).send(error);
            } else {
                res.status(204).end();
            }
        });
    }

    else{
        res.status(403).send('Forbidden')
    }
});

//EDIT USER
router.put('/:username', checkJwt, async function(req, res){
    const password = req.body.password;
    if (req.user.name === req.params.username) {
        const token = await getToken()
        var options = {
            headers: { 
                'Authorization': 'Bearer ' + token
            }, 
            body:{ 
                password: password,
            },
            method: 'PATCH',
            url: 'https://finalproject-224219.auth0.com/api/v2/users/' + req.user.sub,
            audience: 'https://finalproject-224219.auth0.com/api/v2/',
            json: true 
        };

        request(options, (error, response, body) => {
            if (error){
                res.status(500).send(error);
            } else {
                if (response.body.statusCode) {
                    res.status(response.body.statusCode).send(response.body.message);
                }
                else{
                    res.status(200).end()
                }
            }
        });
    }

    else{
        res.status(403).send('Forbidden')
    }
});



//LOGIN
router.post('/login', function(req, res){
    const username = req.body.username;
    const password = req.body.password;
    var options = { 
        method: 'POST',
        url: base_url + '/oauth/token',
        headers: { 'content-type': 'application/json' },
        body:{ 
            scope: 'openid',
            grant_type: 'password',
            username: username,
            password: password,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        },
        audience: 'https://finalproject-224219.auth0.com/api/v2/',
        json: true 
    };

    request(options, (error, response, body) => {
        if (error){
            res.status(500).send(error);
        } else {
            res.send(body);
        }
    });
});

//GET USERS
router.get('/', async function(req, res){
    const token = await getToken()
    var options = {
        headers: { 
            'Authorization': 'Bearer ' + token
        }, 
        method: 'GET',
        url: 'https://finalproject-224219.auth0.com/api/v2/users?fields=email&include_fields=true',
    };

    request(options, (error, response, body) => {
        if (error){
            res.status(500).send(error);
        } else {
            if (response.body.statusCode) {
                res.status(response.body.statusCode).send(response.body.message);
            }
            else{
                res.status(200).send(body)
            }
        }
    });
});




/* ------------- End Ship Controller Functions ------------- */

module.exports = router;
