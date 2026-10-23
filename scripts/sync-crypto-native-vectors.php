<?php

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

$master = hex2bin('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
$keyId = sodium_bin2base64(hex2bin('202122232425262728292a2b2c2d2e2f'), SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
$scope = ['https://sync.example.invalid/', 'https://accounts.example.invalid/', 'fixture-usuario-ñ'];
$plaintext = '{"title":"Prueba ñ","url":"https://example.invalid/"}';
$nonce = hex2bin('000102030405060708090a0b0c0d0e0f1011121314151617');
$salt = hex2bin('101112131415161718191a1b1c1d1e1f');
$passphrase = 'Synthetic compatibility fixture, not a user secret';
$field = fn (string $bytes) => pack('N', strlen($bytes)).$bytes;
$prefix = fn (string $purpose) => "MidoriSync\0{$purpose}\0".pack('N', 2).implode('', array_map($field, $scope)).$field($keyId);
$indices = ['bookmarks' => 1, 'history' => 2, 'tabs' => 3, 'browser-settings' => 4, 'midori-tab' => 5, 'midori-privacy' => 6, 'devices' => 7, 'passwords' => 8, 'credit-cards' => 11, 'form-history' => 12, 'addresses' => 13, 'workspaces' => 14, 'site-permissions' => 15, 'extensions' => 16, 'extension-settings' => 17];
$records = [];
$identities = [];
$identityInput = '["https://example.invalid/página?query=ñ",1728000000000000]';
foreach ($indices as $name => $index) {
    $input = match ($name) {
        'site-permissions' => '[1,"site-permission","https://example.invalid","popup"]',
        'extensions' => '[1,"extension","amo","@portable-extension"]',
        'extension-settings' => '[1,"extension-settings","amo","@portable-extension"]',
        default => $identityInput,
    };
    $identityKey = sodium_crypto_kdf_derive_from_key(32, $index, 'MSPv2ids', $master);
    $identityMessage = "MidoriSync\0identity\0".pack('N', 1).implode('', array_map($field, $scope)).$field($name).$field($input);
    $identities[$name] = [
        'input' => $input, 'message' => base64_encode($identityMessage),
        'digest' => bin2hex(sodium_crypto_generichash($identityMessage, $identityKey, 32)),
    ];
    $context = [
        'collection' => $name, 'id' => 'registro-ñ',
        'generation' => '00000000-0000-4000-8000-000000000001',
        'schema_version' => 1, 'base_revision' => '9007199254740993',
    ];
    foreach (['record' => 'MSPv2rec', 'local' => 'MSPv2loc'] as $purpose => $kdfContext) {
        $key = sodium_crypto_kdf_derive_from_key(32, $index, $kdfContext, $master);
        $aad = $prefix($purpose).pack('N', 1).$field($name).$field($context['id']).$field($context['generation']).$field($context['base_revision']);
        $records[$name][$purpose] = [
            'aad' => base64_encode($aad),
            'envelope' => [
                'crypto_version' => 2, 'key_id' => $keyId, 'purpose' => $purpose, 'context' => $context,
                'nonce' => base64_encode($nonce),
                'ciphertext' => base64_encode(sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($plaintext, $aad, $nonce, $key)),
            ],
        ];
    }
}
$derived = sodium_crypto_pwhash(32, $passphrase, $salt, 3, 67108864, SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13);
$wrappingKey = sodium_crypto_kdf_derive_from_key(32, 0, 'MSPv2key', $derived);
$bundleAad = $prefix('bundle').$field('argon2id13').pack('N3', 65536, 3, 1).$field($salt);
$bundle = [
    'bundle_version' => 2, 'crypto_version' => 2, 'key_id' => $keyId,
    'kdf' => ['algorithm' => 'argon2id13', 'memory_kib' => 65536, 'iterations' => 3, 'parallelism' => 1],
    'salt' => base64_encode($salt), 'nonce' => base64_encode($nonce),
    'ciphertext' => base64_encode(sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($master, $bundleAad, $nonce, $wrappingKey)),
];
echo json_encode([
    'generator' => 'PHP sodium; fixed nonces and all keys are public test fixtures',
    'master_key' => base64_encode($master), 'key_id' => $keyId, 'scope' => $scope,
    'plaintext' => $plaintext, 'nonce' => base64_encode($nonce), 'salt' => base64_encode($salt),
    'passphrase' => $passphrase, 'records' => $records, 'identities' => $identities,
    'bundle_aad' => base64_encode($bundleAad), 'bundle' => $bundle,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n";
