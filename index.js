'use strict'

const AWS = require('aws-sdk')
const S3 = new AWS.S3({
  signatureVersion: 'v4'
})
const Sharp = require('sharp')

const BUCKET = process.env.BUCKET
const URL = process.env.URL
const ALLOWED_RESOLUTIONS = process.env.ALLOWED_RESOLUTIONS ? new Set(process.env.ALLOWED_RESOLUTIONS.split(/\s*,\s*/)) : new Set([])
const ORIGINAL_PREFIX = process.env.ORIGINAL_PREFIX

exports.handler = function (event, context, callback) {
  const key = event.queryStringParameters.key
  console.log('KEY:', key)
  const match = key && key.match(/^((\d+)x(\d+))\/(.+\.jpg)$/)

  // Check if valid query and if requested resolution is allowed
  if (!match || !ALLOWED_RESOLUTIONS.size || !ALLOWED_RESOLUTIONS.has(match[1])) {
    return callback(null, {
      statusCode: '403',
      headers: {},
      body: ''
    })
  }

  const width = parseInt(match[2], 10)
  const height = parseInt(match[3], 10)
  const fit = match[1] === '150x100' ? 'cover' : 'contain'
  const originalKey = `${ORIGINAL_PREFIX}/${match[4]}`

  S3.listObjects({Bucket: BUCKET, Prefix: originalKey.replace(/\.jpg$/, '')}).promise()
    .then((data) => {
      if (!data || !data.Contents || !data.Contents.length) return Promise.reject(new Error('No S3 results'))
      return S3.getObject({Bucket: BUCKET, Key: data.Contents[0].Key}).promise()
    })
    .then(data => Sharp(data.Body)
      .resize(width, height, { fit })
      .toFormat('png')
      .toBuffer()
    )
    .then(buffer => S3.putObject({
      Body: buffer,
      Bucket: BUCKET,
      ContentType: 'image/png',
      Key: key,
      CacheControl: 'max-age=86400'
    }).promise())
    .then(() => callback(null, {
      statusCode: '301',
      headers: {'location': `${URL}/${key}`},
      body: ''
    }))
    .catch(err => callback(err))
}
