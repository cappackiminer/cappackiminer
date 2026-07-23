# Acki Nacki Developer Documentation — Working Guide

> Source: [dev.ackinacki.com](https://dev.ackinacki.com/)  
> Compiled: July 18, 2026  
> Scope: Key developer portal pages, references, examples, and linked SDK resources.

## 1. How to use this guide

This file is a working summary and introductory guide to the information available in the Acki Nacki developer portal. The complete SDK references—especially the ABI, TVM instructions, error codes, and GraphQL schema—are extensive, so links to the original pages are preserved. Code, command, class, field, and opcode names remain unchanged.

Before submitting a transaction to the production network, verify the current network endpoints, compiler version, fees, and changelog. Seed phrases, private keys, and confidential configuration values must never be placed in source code or screenshots.

## 2. SDK overview

The Acki Nacki SDK consists of two main parts:

- **Client Libraries:** Language bindings for the Rust core.
- **CLI:** A command-line tool for compilation, key management, addresses, messages, and contract operations.

The TVM SDK core is written in Rust. It provides the TVM virtual machine, transaction executor, ABI and BOC support, cryptography, signing, hashing, encryption, address validation, and GraphQL access. The JavaScript and TypeScript pages serve as references for the same core API calls used by other bindings.

Primary resources:

- [SDK overview](https://dev.ackinacki.com/)
- [TVM SDK repository](https://github.com/tvmlabs/tvm-sdk)
- [JavaScript examples](https://github.com/tvmlabs/sdk-examples)
- [TVM-CLI reference](https://github.com/tvmlabs/tvm-sdk/tree/main/tvm_cli)

### Official packages and bindings

- `@tvmsdk/core`
- `@tvmsdk/lib-node`
- `@tvmsdk/lib-web`
- Rust core library
- Community bindings for Java and .NET
- A JSON/RPC-like interface for binding developers

### What the SDK can do

1. Create and send external or internal messages.
2. Process messages with expiration, retry, and waiting policies.
3. Call Solidity contracts through their ABI.
4. Emulate transactions locally and execute getter methods.
5. Query account state, balances, blocks, messages, and transactions through GraphQL.
6. Create and read BOCs, validate addresses, and generate signatures and hashes.

Versioning follows semantic-versioning conventions, but breaking changes may still appear in patch or minor releases before mainnet maturity. Review the [CHANGELOG](https://github.com/tvmlabs/tvm-sdk/blob/main/CHANGELOG.md) before upgrading.

## 3. Installation and build summary

A general development environment requires Node.js and a current Rust toolchain. Based on the SDK repository, the basic flow is:

```bash
git clone https://github.com/tvmlabs/tvm-sdk.git
cd tvm-sdk
node build.js
cargo test
```

Generated binding and artifact files are placed under `bin`. The documentation refers to `TON_USE_SE`, `TON_NETWORK_ADDRESS`, `TON_GIVER_SECRET`, and `TON_GIVER_ADDRESS` as testnet configuration variables. Never publish real secret values.

## 4. Multisig wallet and first contract

The [multisig wallet deployment guide](https://dev.ackinacki.com/how-to-deploy-a-multisig-wallet) follows this general flow:

1. Install the CLI and configure the network endpoint.
2. Generate a seed phrase and key pair for the multisig wallet.
3. Store the seed phrase securely and offline.
4. Compile and deploy the wallet contract.
5. Verify the wallet address and transaction status through Explorer or GraphQL.

Never commit unencrypted key files to a repository. Do not mix testnet and production network addresses.

## 5. Dapp ID

The [complete Dapp ID guide](https://dev.ackinacki.com/dapp-id-full-guide-creation-fees-centralized-replenishment) explains the following concepts:

- When a contract is deployed by an external message, its address becomes the system’s Dapp ID.
- To place multiple contracts under the same Dapp ID, deploy new contracts through internal messages from the root contract or its descendants.
- The documented testnet CLI endpoint is `shellnet.ackinacki.org`.
- A contract must be funded with a SHELL balance for deployment.
- `CNVRTSHELLQ` converts SHELL to VMSHELL at a 1:1 ratio. The trailing `Q` indicates quiet behavior, which avoids throwing an error when the balance is insufficient.
- SHELL and VMSHELL rules differ for transfers between contracts under the same Dapp ID.
- In calls between different Dapp IDs, VMSHELL in `msg.value` is reset, and the receiving contract must accept responsibility for the transaction with `tvm.accept()`.

### DappConfig and automatic replenishment

`DappConfig` is an ownerless configuration contract that stores the available VMSHELL credit for a particular Dapp ID. DappRoot deploys it once for each Dapp ID, and anyone can fund it.

The `gosh.mintshell` call mints VMSHELL up to the amount allowed by the DappConfig balance. Applications typically trigger this call when a contract balance falls below a threshold. The DappConfig balance is displayed in SHELL, while the `ecc` account-data field may represent cumulative transfers.

## 6. Bee Engine

The [Bee Engine overview](https://dev.ackinacki.com/bee-engine/bee-engine-overview) describes a client-side NACKL mining engine that can be embedded in an application. Games, utilities, document editors, and other services can run mining in the background while results are verified on-chain.

The [SDK integration page](https://dev.ackinacki.com/bee-engine/bee-engine-sdk-integration-documentation) is still under development. It describes a minimal integration flow and links to the [Bee Engine artifact repository](https://github.com/gosh-sh/bee-engine). Review the repository version and the example application together before using the integration API.

## 7. GraphQL API

The [GraphQL API](https://dev.ackinacki.com/graphql/graphql-api) provides message submission and blockchain-data queries. Common uses include:

- Submitting a prepared message to the blockchain.
- Paginating accounts by `code_hash`.
- Reading account balances and state.
- Paginating account messages and transactions.
- Paginating block and transaction data.
- Planned subscriptions for account updates, events, new blocks, and filtered transaction or message streams.

The [Blockchain API](https://dev.ackinacki.com/graphql/blockchain-api) is the GraphQL `blockchain` root type. It provides real-time blocks, transactions, accounts, account transactions, and account messages. List results use Relay Cursor Connections pagination.

The [Info API](https://dev.ackinacki.com/graphql/info-api) returns the API version and server time. The documentation currently marks block, message, and transaction latency fields as temporarily unsupported.

The [Web Playground](https://dev.ackinacki.com/graphql/web-playground) is available at the network root URL. Testnet example:

```text
https://shellnet.ackinacki.org/graphql
```

Open the schema documentation in Playground to test fields and types directly. The [GraphQL examples](https://dev.ackinacki.com/graphql/graphql-api-examples) page lists connection, block, transaction, event, account, and message queries.

## 8. ABI and contract calls

The [ABI specification](https://dev.ackinacki.com/abi/abi) defines message-body layouts for client-to-contract and contract-to-contract communication. External messages travel from clients to contracts; internal messages travel between contracts. A JSON ABI file acts as the interface for calling contract methods externally or on-chain.

Recommended application flow:

1. Compile the Solidity contract with a TVM-compatible compiler.
2. Generate the TVC and ABI JSON files.
3. Build a constructor or method message body from the ABI.
4. Emulate the message locally.
5. Submit it to testnet after checking fees and balances.
6. Verify the transaction and resulting account state through GraphQL.

## 9. VM instructions and verification

The [Acki Nacki VM instructions](https://dev.ackinacki.com/vm-instructions/acki-nacki-vm-instructions) page lists custom opcodes. Two notable instructions are:

- `MINTECC (C726)`: Mints ECC tokens and can only be called by privileged contracts.
- `CNVRTSHELLQ (C727)`: Converts SHELL to VMSHELL at a 1:1 ratio. The amount is expressed in nanotokens and is capped at the available balance.

According to the [Formal Verification](https://dev.ackinacki.com/vm-instructions/formal-verification) page, the Pruvendo team formally verified the Block Keeper smart contracts.

## 10. Error handling

`TVMClientError` in the [Core Library Error API](https://dev.ackinacki.com/reference/error_api) has three main parts:

- `code: number`: A unique error code.
- `message: string`: A human-readable description.
- `data: ErrorData`: Optional code-specific details.

Additional data may include fields such as `message_id`, `shard_block_id`, `core_version`, `waiting_expiration_time`, `block_time`, and the transaction phase.

[Error-code](https://dev.ackinacki.com/reference/error_codes) groups:

| Range | Group |
|---:|---|
| 1–99 | Client |
| 100–199 | Cryptography |
| 200–299 | BOC |
| 300–399 | ABI |
| 400–499 | TVM |
| 500–599 | Processing |
| 600–699 | Network |
| 800–899 | DeBot |

Solidity runtime and TVM virtual-machine runtime errors are documented separately.

## 11. JSON interface for binding developers

The [JSON Interface to TVM Client](https://dev.ackinacki.com/for-binding-developers/json_interface) is an asynchronous JSON-RPC-like request and response layer for languages other than Rust. The library receives requests through `request`, and the application receives responses through `response_handler`.

This approach separates the following responsibilities when implementing a new language binding:

1. Convert the JSON request to the correct method and parameter shape.
2. Preserve the request identifier.
3. Route the asynchronous response back to the correct call.
4. Forward error codes, messages, and additional data without losing information.

The [Application Objects](https://dev.ackinacki.com/for-binding-developers/app_objects) page explains how a binding generator can identify functions that accept application objects and support their callback and response protocol.

## 12. DEX.DO smart-contract interfaces

The [Smart Contract Interfaces](https://dev.ackinacki.com/dex.do/smart-contract-interfaces) section includes:

- Nullifier
- RootPN
- PrivateNote
- RootOracle
- Oracle
- OracleEventList
- Pari Mutuel Pool (PMP)

Evaluate all methods and fields in this section together with the ABI and GraphQL documentation when integrating a contract.

## 13. Quick starts and examples

- [Quick Starts](https://dev.ackinacki.com/quick-starts): Initial connection and basic flows.
- [GraphQL examples](https://dev.ackinacki.com/graphql/graphql-api-examples): Block, transaction, account, and message queries.
- [SDK examples repository](https://github.com/tvmlabs/sdk-examples): Working examples for client libraries.
- [TVM SDK on GitHub](https://github.com/tvmlabs/tvm-sdk): Core, bindings, and CLI.

## 14. Practical integration plan for CappAckiMiner

1. **Network layer:** Keep testnet and mainnet endpoints separate from application UI settings.
2. **Wallets:** Never write seed phrases or keys to UI logs; use secure local storage.
3. **Contracts:** Pin TVC and ABI versions with the application release.
4. **Transactions:** Emulate locally first, submit to testnet second, and verify through GraphQL last.
5. **Mining:** Run the Bee Engine integration as an isolated service or worker; the UI should display only status and metrics.
6. **Errors:** Present `TVMClientError.code`, `message`, and `data` safely and clearly.
7. **Monitoring:** Record API version, latest block, transaction state, and pending-message duration as separate metrics.

## 15. Resource inventory

The main developer portal topics include the SDK overview, multisig deployment, Dapp ID, Quick Starts, DEX.DO contract interfaces, Bee Engine, Core Library Reference, Error API, Error Codes, TVM-CLI, VM instructions, Formal Verification, GraphQL/Blockchain/Info APIs, Web Playground, GraphQL examples, ABI, JavaScript examples, binding-developer guides, and the TVM SDK repository.

This inventory reflects the portal menu observed on July 18, 2026. Review this guide again when the portal changes.
