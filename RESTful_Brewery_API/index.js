const router = module.exports = require('express').Router();

router.use('/beer', require('./beer'));
router.use('/breweries', require('./breweries'));
router.use('/users', require('./users'));