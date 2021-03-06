'use strict'

const elasticsearch = require('elasticsearch')
const conf = require('../config/nconf')
const uuid = require('node-uuid')
const mappings = require('../../data/mappings.json')

let client

function init () {
  client = new elasticsearch.Client({
    host: conf.get('elasticsearch:host') + ':' + conf.get('elasticsearch:port'),
    log: 'trace'
  })

  const mappingz = Object.keys(mappings)

  return Promise.all(
    mappingz.map((index) =>
      client.index({
        index,
        type: mappings[index].type,
        body: {}
      }).then(() => client.indices.putMapping(mappings[index]))
      )
    ).catch((err) => console.error(err))
}

function saveUser (id, user) {
  user.timestampLastupdated = new Date()

  let params = {
    index: 'users',
    type: 'user',
    id: id,
    body: {
      doc: user,
      doc_as_upsert: true
    }
  }

  return client.update(params)
    .then((result) => {
      if (result._shards.successful) {
        return {message: 'User is successfully updated'}
      }

      return {message: 'User did not update successfully. Check your payload again.'}
    })
}

function getUser (userId) {
  return client.get({
    index: 'users',
    type: 'user',
    id: userId
  }).then((user) => user)
}

function createUser (phone) {
  let callback = function (phone) {
    let user = {
      timestampCreated: new Date(),
      phone: phone
    }

    let params = {
      index: 'users',
      type: 'user',
      id: uuid.v4(),
      body: {
        doc: user,
        doc_as_upsert: true
      }
    }

    return client.update(params)
      .then()
      .then((user) => ({ userId: user._id }))
  }

  return getUserByPhone(phone).then((result) => {
    let hits = result.hits.hits

    if (hits.length > 0) {
      return { userId: hits[0]._id }
    }

    return callback(phone)
  }).catch((err) => {
    console.log(err)
    return callback(phone)
  })
}

function getUserByPhone (phone) {
  return client.search({
    index: 'users',
    q: 'phone:' + phone
  })
}

function getProfs (rootId) {
  return client.search({
    index: 'proficiencies',
    type: 'proficiency',
    id: rootId,
    from: 0,
    size: 1000
  })
}

function getChildrenProfs (parentId) {
  return client.search({
    index: 'proficiencies',
    type: 'proficiency',
    q: 'foralder:' + parentId,
    from: 0,
    size: 1000
  })
}

function countUsers () {
  return client.search({
    index: 'users',
    body: {
      query: {
        match_all: {}
      }
    }
  })
}

function getOccupationCountList (query) {
  return client.search({
    index: 'users',
    type: 'user',
    body: {
      query: {
        filtered: {
          query: {
            query_string: {
              query: query || '*',
              analyze_wildcard: true
            }
          }
        }
      },
      aggs: {
        count: {
          terms: { field: 'occupations.name' }
        }
      }
    }
  }).then((res) => {
    let result = res.aggregations.count.buckets

    result.forEach((d) => {
      d['title'] = d.key
      d['size'] = d.doc_count

      delete d.key
      delete d.doc_count
    })

    return result
  })
}

module.exports = {
  getUser,
  saveUser,
  init,
  createUser,
  getUserByPhone,
  getProfs,
  getChildrenProfs,
  countUsers,
  getOccupationCountList
}
