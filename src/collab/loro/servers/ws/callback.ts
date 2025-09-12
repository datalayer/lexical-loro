import http from 'http'
import * as number from 'lib0/number'

const CALLBACK_URL = process.env.CALLBACK_URL ? new URL(process.env.CALLBACK_URL) : null
const CALLBACK_TIMEOUT = number.parseInt(process.env.CALLBACK_TIMEOUT || '5000')
const CALLBACK_OBJECTS = process.env.CALLBACK_OBJECTS ? JSON.parse(process.env.CALLBACK_OBJECTS) : {}

export const isCallbackSet = !!CALLBACK_URL

/**
 * @param {import('./utils.ts').WSSharedDoc} doc
 */
export const callbackHandler = (doc) => {
  const room = doc.name
  const dataToSend = {
    room,
    data: {}
  }
  const sharedObjectList = Object.keys(CALLBACK_OBJECTS)
  sharedObjectList.forEach(sharedObjectName => {
    const sharedObjectType = CALLBACK_OBJECTS[sharedObjectName]
    const content = getContent(sharedObjectName, sharedObjectType, doc)
    dataToSend.data[sharedObjectName] = {
      type: sharedObjectType,
      content: content && typeof content.toJSON === 'function' ? content.toJSON() : content
    }
  })
  CALLBACK_URL && callbackRequest(CALLBACK_URL, CALLBACK_TIMEOUT, dataToSend)
}

/**
 * @param {URL} url
 * @param {number} timeout
 * @param {Object} data
 */
const callbackRequest = (url, timeout, data) => {
  data = JSON.stringify(data)
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    timeout,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }
  const req = http.request(options)
  req.on('timeout', () => {
    console.warn('Callback request timed out.')
    req.abort()
  })
  req.on('error', (e) => {
    console.error('Callback request error.', e)
    req.abort()
  })
  req.write(data)
  req.end()
}

/**
 * @param {string} objName
 * @param {string} objType
 * @param {import('./utils.ts').WSSharedDoc} doc
 */
const getContent = (objName, objType, doc) => {
  // Loro uses a different API than YJS
  // Get the container by name and type
  try {
    switch (objType) {
      case 'List':
      case 'Array': 
        return doc.doc.getList(objName)
      case 'Map': 
        return doc.doc.getMap(objName)
      case 'Text': 
        return doc.doc.getText(objName)
      case 'Tree':
        return doc.doc.getTree(objName)
      default: {
        // For unknown types, return the entire document state
        return doc.doc.toJSON()
      }
    }
  } catch (error) {
    console.warn(`Failed to get content for ${objName} of type ${objType}:`, error)
    return {}
  }
}
