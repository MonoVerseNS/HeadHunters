import { Address } from '@ton/ton';

const addresses = [
    '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa',
    'EQBLL01uhdRTfOCDaKJCXglWwZZNxI12K5JFNslusJAx66uq'
];

for (const a of addresses) {
    try {
        const addr = Address.parse(a);
        console.log(`Address: ${a}`);
        console.log(`Raw: ${addr.toRawString()}`);
        console.log(`Hash (hex): ${addr.hash.toString('hex')}`);
        console.log('---');
    } catch (e) {
        console.log(`Error parsing ${a}: ${e.message}`);
    }
}
