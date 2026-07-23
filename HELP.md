# CappAckiMiner Help and User Guide

This guide explains how to install CappAckiMiner, connect wallets, use the Main and Lite views, manage licenses and backups, understand network indicators, and troubleshoot common problems.

## 1. What is CappAckiMiner?

CappAckiMiner is a Windows application for managing multiple Acki Nacki wallets from one desktop interface. You can:

- View registered wallets on one screen.
- Monitor wallet balances and recent rewards.
- Start or stop wallets individually or as a group.
- Switch between Main and Lite views.
- Select wallets covered by your license.
- Move wallet profiles to another computer with an encrypted transfer file.
- Review application, connection, and network events in the Log panel.

CappAckiMiner is not a wallet application. Sending, receiving, and spending assets remain available through AN Wallet.

## 2. System requirements

- 64-bit Windows 10 or Windows 11
- A working internet connection
- The latest AN Wallet application
- An Acki Nacki account
- A phone or compatible device that can scan QR codes
- A CappAckiMiner license that supports the number of wallets you want to use

CPU temperature is shown only when Windows and the hardware provide a compatible temperature source. An empty temperature value does not necessarily indicate an application error.

## 3. Installation

1. Download the official CappAckiMiner installer.
2. Run the installer.
3. If Windows displays a security warning, verify the download source and release version.
4. Complete the installation steps.
5. Open CappAckiMiner.
6. Wait for initial preparation to finish and for registered wallet statuses to appear.

Before upgrading, create an encrypted backup of important wallet profiles.

## 4. First launch

When the application opens:

- Local settings are loaded.
- Registered wallet profiles are restored.
- The engine for the active view is prepared.
- License status is checked.
- Balance, reward, and network data are refreshed in sequence.

Initial preparation may take several minutes when many wallets are registered. During this time, wallet cards may display `STARTING`, `WAITING`, or their equivalent in the selected language.

## 5. Main and Lite views

### Main

Main displays wallets as cards. Each card can show the wallet name, status, balance, recent rewards, result counters, progress, and wallet controls.

Main is best for detailed monitoring and card-based operation.

### Lite

Lite uses a denser table layout. Wallet names, statuses, balances, recent rewards, results, and controls occupy less screen space. Search and status filters are also available.

Lite is best for monitoring many wallets on one screen.

### Switching views

Main and Lite use separate runtime engines. When you switch views, the previous engine stops and the selected view is prepared. Only the active view's engine can run at a time. Both views use the same registered wallets and license information.

The view button may display `SWITCHING` during the transition. Wait for preparation to finish before switching again or closing the application.

## 6. Header indicators

### CPU

Shows current processor usage. Brief increases can be normal while many wallets are being prepared or data is being refreshed.

### TEMP

Shows CPU temperature. If the value becomes high:

- Check the computer's ventilation.
- Review the Windows power plan.
- Disable interface animations.
- Close unnecessary applications.
- Try operating fewer wallets.

### TPS

Shows current transaction activity reported by the Acki Nacki network. It represents general network conditions, not the local speed of the application.

### STRESS

Estimates network stress from recent requests, response delays, and connection errors:

- `LOW`: No significant recent network problem was detected.
- `MEDIUM`: Temporary delays or unsuccessful requests were detected.
- `HIGH`: Network responses show frequent errors or heavy delays.
- `UNKNOWN`: There is not enough live data for a reliable estimate.

STRESS is an estimate and does not guarantee any reward or transaction result.

### Total and daily NACKL

Total NACKL is the sum of accessible balances for wallets registered in the application. The daily or 24-hour value is calculated from available live reward data. These values may update late when the network data source is delayed.

## 7. Adding a wallet

1. Select `ADD WALLET`.
2. Enter the AN Wallet account name exactly.
3. Select the button that generates the QR code.
4. Scan the QR code with AN Wallet.
5. Approve the connection and authorization request on the phone.
6. Wait for CappAckiMiner to recognize the wallet and create its card.

The card may take some time to appear after approval, depending on network conditions. Do not repeatedly add the same wallet.

### If the QR window remains open

- Confirm that approval was completed on the phone.
- Make sure you used the correct AN Wallet account.
- Check the internet connection on both devices.
- Wait a few minutes for network confirmation.
- If the process does not finish, close the window and reconnect the wallet.

## 8. Wallet cards and rows

A Main card or Lite row can include:

- Wallet account name
- Current operating status
- NACKL balance
- Most recent reward or rewards
- Accepted and rejected counters
- Start and stop controls
- QR reconnection control
- Local profile removal control

Reward times use the 24-hour clock. An empty reward area can mean that no recent reward information is available from the network.

## 9. Balance sorting

The `BALANCE` button sorts wallets from highest to lowest balance. While enabled, the order may change when new balance information arrives.

When sorting is disabled, wallets return to their saved or placed order. The button label and description follow the selected application language.

## 10. Wallet controls

### Start All

Starts eligible, selected, and connected wallets in sequence. Do not press the button repeatedly while startup is in progress.

### Stop All

Stops active operations and cancels queued group starts.

### Start or stop one wallet

The green control on a card or row starts only that wallet. The red control stops only that wallet.

### Reconnect

The circular-arrow control opens a new QR connection process. Use it when:

- The wallet displays `RESTORE FAILED`.
- Its saved connection key is invalid.
- The application explicitly requests authorization again.
- The wallet cannot be prepared and reports a persistent connection error.

Wallets in `READY` or ordinary `WAITING` status do not automatically require a new QR authorization.

### Remove wallet

The remove control deletes only the local CappAckiMiner profile. It does not delete the blockchain account, the AN Wallet account, or its balance.

## 11. Status reference

- `READY`: The wallet is prepared and can be started.
- `STARTING`: Local wallet preparation is in progress.
- `RUNNING` or `COMPUTING`: The wallet is actively operating.
- `WAITING`: A definitive response is still expected from the network or SDK.
- `RECOVERING`: The application is safely rebuilding the wallet connection.
- `STOPPED`: The wallet was stopped by the user or by Stop All.
- `FINISHED`: The current operation has completed.
- `NETWORK REJECTED`: The network did not accept the operation.
- `ERROR`: A connection, SDK, or local operation failed.
- `RECOVERY FAILED` or `RESTORE FAILED`: The wallet could not be prepared from its saved connection information.

`WAITING` is not always an error. If many wallets remain in this status for an unusually long time, review the STRESS indicator and the Log panel.

## 12. License system

Main and Lite share the same license information. Switching views does not require another license.

A license may:

- Support a defined wallet capacity.
- Include an expiration period.
- Be bound to a specific device.
- Limit the wallets that can be active at the same time.

### Activating a license

1. Open the `ADMIN` panel.
2. Paste the license key into the appropriate field.
3. Select the activation button.
4. Check the capacity and expiration information on the license status card.
5. Select the wallets that will operate if required.

Activation can fail when the license key does not match the device code.

### Free use

Any free or donation-supported capacity is shown in the in-app license status. Review the license packages inside the application for current availability.

## 13. Wallet backup and transfer

### Creating a backup

1. Open the `ADMIN` panel.
2. Select the wallet backup transfer tool.
3. Create a strong password that you can remember.
4. Store the generated transfer file in a secure location.

CappAckiMiner cannot recover the backup password. If you lose it, the encrypted backup cannot be opened.

### Importing a backup on another computer

1. Install CappAckiMiner on the destination computer.
2. Open the transfer file there.
3. Enter the backup password when prompted.
4. Wait for the profiles to be imported.
5. Review the wallet card statuses.
6. Approve wallets by QR only when the application requests reconnection.

Never share the transfer file, its password, or wallet connection data through public channels.

## 14. Language, theme, and appearance

The logo menu provides these interface languages:

- Turkish
- English
- Russian
- Arabic
- Simplified Chinese
- Indonesian

Language selection is saved between launches. Interface shape, theme, and animation preferences can also be changed from the same menu.

Disabling animations reduces visual effects. Wallet balances, license checks, and network data continue to operate.

## 15. Log panel

The Log panel displays timestamped application, wallet, SDK, recovery, and network events.

Available actions include:

- Save the log to a file.
- Open the log folder.
- Clear the visible log entries.

Clearing the log does not delete wallet profiles or balances.

When reporting a problem, include:

- Application version
- Windows version
- Approximate time of the problem
- Affected wallet name
- Status shown on its card
- Relevant log lines
- STRESS and TPS values

Do not share QR contents, private keys, backup passwords, or complete license keys.

## 16. Troubleshooting

### Most wallets remain in WAITING

1. Check the STRESS indicator.
2. Confirm whether TPS is updating.
3. Look for network or SDK errors in the Log panel.
4. Allow a few minutes for automatic recovery.
5. If every wallet changed at the same time, a network-wide issue is more likely.
6. If the condition persists, use `STOP ALL`, close the application completely, and reopen it.

Reauthorizing every wallet by QR should not be the first response.

### RESTORE FAILED is displayed

1. Select reconnect for the affected wallet.
2. Scan the QR code with the correct AN Wallet account.
3. Complete approval.
4. Wait for the card to become ready again.

If only one or two wallets are affected, reconnect only those wallets first.

### A wallet was approved but its card appears late

Network verification after approval can take time. If both devices have a working connection, wait several minutes. Do not repeatedly add the same account.

### Balance or reward does not update

- Check the network indicators.
- Look for data-query errors in the Log panel.
- Verify the wallet account name.
- Wait for the next automatic refresh.
- Reopen the application if the problem continues.

### Start All is unavailable

- Confirm that the license is active.
- Confirm that at least one wallet is selected under the license.
- Wait for any view transition to finish.
- Make sure the wallets have completed preparation.
- Complete or close any open QR approval window.

### CPU usage or temperature is high

- Disable animations.
- Close unnecessary applications.
- Check the computer's cooling and ventilation.
- Compare operation with fewer wallets.
- Review the Windows power plan.

### The application does not open

- Check Windows security notifications.
- Confirm that the installer downloaded completely.
- Restart the computer.
- Reinstall the application.
- If the problem continues, send the latest file from the Log folder to support.

## 17. Security

- Never share wallet private keys.
- Do not publicly share screenshots containing QR codes or connection links.
- Store the backup password separately from its transfer file.
- Do not distribute private developer files used to create licenses.
- Run installers only from trusted official releases.
- Mask wallet names and sensitive data when reporting a problem.

## 18. Closing the application and system tray

Hiding the window in the system tray may not stop the application. To end active operation, use `STOP ALL` first and then fully exit the application.

Stop active wallets before updating or uninstalling CappAckiMiner, or before shutting down the computer.
