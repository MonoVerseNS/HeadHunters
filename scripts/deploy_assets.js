import fs from 'fs'
import path from 'path'
import TonWeb from 'tonweb'
import { TonClient, WalletContractV5R1, internal, Cell } from '@ton/ton'
import { mnemonicToWalletKey } from '@ton/crypto'
import { uploadToPinata, uploadJsonToPinata } from './pinataHelper.js'

async function deployContracts() {
    console.log('--- HeadHunters Asset Deployer (V5R1) ---')

    // 1. Read config
    const env = JSON.parse(fs.readFileSync(path.resolve('env.json'), 'utf-8'))
    const adminMnemonic = env.ton.adminMnemonic

    if (!adminMnemonic) {
        console.error("❌ ERROR: adminMnemonic is missing in env.json!")
        process.exit(1)
    }

    const isMainnet = env.ton.network === 'mainnet'
    const endpoint = isMainnet ? 'https://toncenter.com/api/v2/jsonRPC' : 'https://testnet.toncenter.com/api/v2/jsonRPC'
    console.log(`Connecting to ${isMainnet ? 'Mainnet' : 'Testnet'} via ${endpoint}`)

    const client = new TonClient({ endpoint, apiKey: env.ton.toncenterApiKey })
    const tonweb = new TonWeb(new TonWeb.HttpProvider(endpoint, { apiKey: env.ton.toncenterApiKey }))

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Retry Wrapper for Network Calls
    async function withRetry(fn, retries = 5) {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (err) {
                if (i === retries - 1) throw err;
                console.log(`[Rate Limit / Network Error] Retrying in 5s... (${i + 1}/${retries})`);
                await sleep(5000);
            }
        }
    }

    // 2. Init V5R1 Wallet via @ton/ton
    console.log('\n1. Initializing Admin V5R1 Wallet...')
    const keyPair = await mnemonicToWalletKey(adminMnemonic.split(' '))
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 })
    const walletContract = client.open(wallet)

    const walletAddress = wallet.address.toString({ bounceable: true, testOnly: !isMainnet })
    console.log(`Deployer Wallet Address: ${walletAddress}`)

    await sleep(2500)
    const balanceTonNano = await withRetry(() => walletContract.getBalance())
    const balanceTon = Number(balanceTonNano) / 1e9
    console.log(`Deployer Balance: ${balanceTon} TON`)

    if (balanceTon < 0.5) {
        console.error("❌ ERROR: Insufficient balance. Need at least 0.5 TON to deploy.")
        process.exit(1)
    }

    // 3. Upload Metadata to IPFS
    console.log('\n2. Processing and Uploading Metadata to IPFS...')
    let coinLogoUrl, collectionBannerUrl
    try {
        coinLogoUrl = await uploadToPinata(path.resolve('СoinLogo.png'))
    } catch (e) {
        console.log("Using Fallback for Coin Logo")
        coinLogoUrl = "https://raw.githubusercontent.com/telegram/ton/master/crypto/func/auto.test/toncoin.png"
    }
    try {
        collectionBannerUrl = await uploadToPinata(path.resolve('CollectionBanner.jpg'))
    } catch (e) {
        console.log("Using Fallback for Collection Banner")
        collectionBannerUrl = "https://raw.githubusercontent.com/telegram/ton/master/crypto/func/auto.test/toncoin.png"
    }

    let jettonMetadataUrl = await uploadJsonToPinata({
        name: "HunterCoin",
        symbol: "HHCOIN",
        description: "Локальная монета для проекта head-hunters.ton",
        image: coinLogoUrl,
        decimals: "9"
    }, 'huntercoin').catch(() => "https://raw.githubusercontent.com/ton-community/tutorials/main/03-client/test/json/jetton.json")

    let collectionMetadataUrl = await uploadJsonToPinata({
        name: "HeadHunter",
        description: "приватная коллекция NFT в синхронизации с телеграмм",
        image: collectionBannerUrl,
    }, 'headhunter-collection').catch(() => "https://raw.githubusercontent.com/ton-community/tutorials/main/03-client/test/json/collection.json")

    console.log(`Metadata Ready!`)
    console.log(`Jetton: ${jettonMetadataUrl}`)
    console.log(`Collection: ${collectionMetadataUrl}`)

    // Helper to send messages via V5
    async function sendDeployMsg(contractStateInitBoc, addressStr) {
        const stateInitCell = Cell.fromBoc(Buffer.from(contractStateInitBoc))[0]
        const seqno = await withRetry(() => walletContract.getSeqno())
        await withRetry(() => walletContract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            messages: [
                internal({
                    to: addressStr,
                    value: '0.05',
                    init: { code: stateInitCell.refs[0], data: stateInitCell.refs[1] },
                    bounce: false
                })
            ]
        }))
        console.log(`Sent deploy transaction to ${addressStr}... waiting 30s.`)
        await sleep(30000)
    }

    // 4. Deploy NFT Collection
    console.log('\n3. Deploying NFT Collection...')
    const NFT_ITEM_CODE_HEX = 'B5EE9C7241020D010001D0000114FF00F4A413F4BCF2C80B0102016202030202CE04050009A11F9FE00502012006070201200B0C02D70C8871C02497C0F83434C0C05C6C2497C0F83E903E900C7E800C5C75C87E800C7E800C3C00812CE3850C1B088D148CB1C17CB865407E90350C0408FC00F801B4C7F4CFE08417F30F45148C2EA3A1CC840DD78C9004F80C0D0D0D4D60840BF2C9A884AEB8C097C12103FCBC20080900113E910C1C2EBCB8536001F65135C705F2E191FA4021F001FA40D20031FA00820AFAF0801BA121945315A0A1DE22D70B01C300209206A19136E220C2FFF2E192218E3E821005138D91C85009CF16500BCF16712449145446A0708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB00104794102A375BE20A00727082108B77173505C8CBFF5004CF1610248040708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB000082028E3526F0018210D53276DB103744006D71708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB0093303234E25502F003003B3B513434CFFE900835D27080269FC07E90350C04090408F80C1C165B5B60001D00F232CFD633C58073C5B3327B5520BF75041B';
    const NftCollection = TonWeb.token.nft.NftCollection
    const nftCollection = new NftCollection(tonweb.provider, {
        ownerAddress: new TonWeb.utils.Address(walletAddress),
        royalty: 0.05,
        royaltyAddress: new TonWeb.utils.Address(walletAddress),
        collectionContentUri: collectionMetadataUrl,
        nftItemContentBaseUri: "https://example.com/nft/",
        nftItemCodeHex: NFT_ITEM_CODE_HEX
    })

    const nftCollAddress = (await nftCollection.getAddress()).toString(true, true, true)
    console.log(`Expected NFT Collection Address: ${nftCollAddress}`)

    await sleep(2500)
    const collState = await withRetry(() => tonweb.provider.getAddressInfo(nftCollAddress))
    if (collState.state === 'active') {
        console.log('NFT Collection is already deployed!')
    } else {
        const stateInitBoc = await (await nftCollection.createStateInit()).stateInit.toBoc(false)
        await sendDeployMsg(stateInitBoc, nftCollAddress)
    }

    // 5. Deploy Jetton (HunterCoin)
    console.log('\n4. Deploying HunterCoin (Jetton Minter)...')
    const JETTON_WALLET_CODE_HEX = 'B5EE9C7241021201000328000114FF00F4A413F4BCF2C80B0102016202030202CC0405001BA0F605DA89A1F401F481F481A8610201D40607020148080900BB0831C02497C138007434C0C05C6C2544D7C0FC02F83E903E900C7E800C5C75C87E800C7E800C00B4C7E08403E29FA954882EA54C4D167C0238208405E3514654882EA58C511100FC02780D60841657C1EF2EA4D67C02B817C12103FCBC2000113E910C1C2EBCB853600201200A0B020120101101F500F4CFFE803E90087C007B51343E803E903E90350C144DA8548AB1C17CB8B04A30BFFCB8B0950D109C150804D50500F214013E809633C58073C5B33248B232C044BD003D0032C032483E401C1D3232C0B281F2FFF274013E903D010C7E801DE0063232C1540233C59C3E8085F2DAC4F3208405E351467232C7C6600C03F73B51343E803E903E90350C0234CFFE80145468017E903E9014D6F1C1551CDB5C150804D50500F214013E809633C58073C5B33248B232C044BD003D0032C0327E401C1D3232C0B281F2FFF274140371C1472C7CB8B0C2BE80146A2860822625A020822625A004AD822860822625A028062849F8C3C975C2C070C008E00D0E0F009ACB3F5007FA0222CF165006CF1625FA025003CF16C95005CC2391729171E25008A813A08208989680AA008208989680A0A014BCF2E2C504C98040FB001023C85004FA0258CF1601CF16CCC9ED5400705279A018A182107362D09CC8CB1F5230CB3F58FA025007CF165007CF16C9718018C8CB0524CF165006FA0215CB6A14CCC971FB0010241023000E10491038375F040076C200B08E218210D53276DB708010C8CB055008CF165004FA0216CB6A12CB1F12CB3FC972FB0093356C21E203C85004FA0258CF1601CF16CCC9ED5400DB3B51343E803E903E90350C01F4CFFE803E900C145468549271C17CB8B049F0BFFCB8B0A0822625A02A8005A805AF3CB8B0E0841EF765F7B232C7C572CFD400FE8088B3C58073C5B25C60063232C14933C59C3E80B2DAB33260103EC01004F214013E809633C58073C5B3327B55200083200835C87B51343E803E903E90350C0134C7E08405E3514654882EA0841EF765F784EE84AC7CB8B174CFCC7E800C04E81408F214013E809633C58073C5B3327B55205ECCF23D';
    const JettonMinter = TonWeb.token.ft.JettonMinter
    const jettonMinter = new JettonMinter(tonweb.provider, {
        ownerAddress: new TonWeb.utils.Address(walletAddress),
        jettonContentUri: jettonMetadataUrl,
        jettonWalletCodeHex: JETTON_WALLET_CODE_HEX,
        adminAddress: new TonWeb.utils.Address(walletAddress)
    })

    const jettonMinterAddress = (await jettonMinter.getAddress()).toString(true, true, true)
    console.log(`Expected Jetton Address: ${jettonMinterAddress}`)

    await sleep(2500)
    const jettonState = await withRetry(() => tonweb.provider.getAddressInfo(jettonMinterAddress))
    if (jettonState.state === 'active') {
        console.log('Jetton is already deployed!')
    } else {
        const stateInitBoc = await (await jettonMinter.createStateInit()).stateInit.toBoc(false)
        await sendDeployMsg(stateInitBoc, jettonMinterAddress)
    }

    // 6. Mint Initial tokens (1,000,000,000)
    console.log('\n5. Minting Initial Supply to your wallet...')
    const mintAmount = TonWeb.utils.toNano('1000000000')
    const mintPayloadCellTonWeb = await jettonMinter.createMintBody({
        toAddress: new TonWeb.utils.Address(walletAddress),
        amount: mintAmount,
        tokenAmount: mintAmount,
        forwardAmount: TonWeb.utils.toNano('0.01'),
        forwardPayload: new Uint8Array(0)
    })

    const mintPayloadBoc = await mintPayloadCellTonWeb.toBoc(false)
    const mintPayloadCell = Cell.fromBoc(Buffer.from(mintPayloadBoc))[0]

    await sleep(2500)
    const seqno = await withRetry(() => walletContract.getSeqno())
    await withRetry(() => walletContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: jettonMinterAddress,
                value: '0.05',
                body: mintPayloadCell,
                bounce: true
            })
        ]
    }))
    console.log('Minting transaction sent! Wait 20 seconds...')
    await sleep(20000)

    // 7. Save to env.json
    console.log('\n--- Deployment Summary ---')
    console.log(`NFT Collection: ${nftCollAddress}`)
    console.log(`Jetton Minter:  ${jettonMinterAddress}`)

    env.ton.nftCollectionAddress = nftCollAddress
    env.ton.jettonMasterAddress = jettonMinterAddress
    fs.writeFileSync(path.resolve('env.json'), JSON.stringify(env, null, 4))

    console.log('\n✅ Successfully saved new contract addresses to env.json!')
}

deployContracts().catch(console.error)
