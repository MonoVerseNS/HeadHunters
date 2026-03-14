import fs from 'fs'
import path from 'path'
import { getDB } from '../server/db.js'

export async function uploadToPinata(filePath) {
    const env = JSON.parse(fs.readFileSync(path.resolve('env.json'), 'utf-8'))
    const { pinataApiKey, pinataSecretKey } = env.api || {}

    if (!pinataApiKey || !pinataSecretKey) {
        throw new Error("Pinata API keys are missing in env.json. Cannot upload images to IPFS.")
    }

    const { default: FormData } = await import('form-data')
    const { default: fetch } = await import('node-fetch')

    const formData = new FormData()
    formData.append('file', fs.createReadStream(filePath))

    console.log(`Uploading ${path.basename(filePath)} to Pinata IPFS...`)

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            pinata_api_key: pinataApiKey,
            pinata_secret_api_key: pinataSecretKey,
            ...formData.getHeaders()
        },
        body: formData
    })

    const data = await response.json()
    if (!response.ok) {
        throw new Error(`Pinata upload failed: ${data.error || JSON.stringify(data)}`)
    }

    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`
    console.log(`Upload successful! IPFS URL: ${ipfsUrl}`)
    return ipfsUrl
}

export async function uploadJsonToPinata(jsonObj, name) {
    const env = JSON.parse(fs.readFileSync(path.resolve('env.json'), 'utf-8'))
    const { pinataApiKey, pinataSecretKey } = env.api || {}

    if (!pinataApiKey || !pinataSecretKey) {
        throw new Error("Pinata API keys are missing in env.json. Cannot upload metadata to IPFS.")
    }

    const { default: fetch } = await import('node-fetch')

    console.log(`Uploading ${name} metadata to Pinata IPFS...`)

    const body = {
        pinataOptions: { cidVersion: 1 },
        pinataMetadata: { name: `${name}.json` },
        pinataContent: jsonObj
    }

    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            pinata_api_key: pinataApiKey,
            pinata_secret_api_key: pinataSecretKey
        },
        body: JSON.stringify(body)
    })

    const data = await response.json()
    if (!response.ok) {
        throw new Error(`Pinata JSON upload failed: ${data.error || JSON.stringify(data)}`)
    }

    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`
    console.log(`JSON upload successful! IPFS URL: ${ipfsUrl}`)
    return ipfsUrl
}
