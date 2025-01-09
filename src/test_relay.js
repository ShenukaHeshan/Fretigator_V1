import fs from 'fs';
import delay from 'delay';
import colors from 'colors';
import gpio from 'rpi-gpio';


eval(fs.readFileSync('./include/constants.js') + '');
import relayDrive from "./include/RelayController.js";
import * as CF from "./include/commonFunctions.js";

global.I2C_Busy = 0;
let relayDriver1 = new relayDrive(0x21, 0x27, "1", 8, function (index) {
    if (CURRENT_STATE > POWER_ON_STATE || CURRENT_STATE != LOCK_STATE) {

    }

}, function (err) {
    err.forEach(element => {
        CF.ErrorLog("driver " + element.driver + "  " + element.error);

    });
});

let relayDriver2 = new relayDrive(0x22, 0x20, "2", 4, function (index) {
    if (CURRENT_STATE > POWER_ON_STATE || CURRENT_STATE != LOCK_STATE) {

    }

}, function (err) {
    err.forEach(element => {
        CF.ErrorLog("driver " + element.driver + "  " + element.error);

    });
});


gpio.setMode(gpio.MODE_BCM);
// main relay
gpio.setup(20, gpio.DIR_OUT, () => {
    gpio.write(20, 1, (err) => {
        if (err) throw err;
        //	CF.DebugLog(dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT") + ` Pin 38 initialize to 0`);
    });
});
gpio.setup(11, gpio.DIR_OUT, () => {
    gpio.write(11, 0, (err) => {
        if (err) throw err;
        //	CF.DebugLog(dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT") + ` Pin 38 initialize to 0`);
    });
});
var count = 0;
var value = 0;


global.relayValueTracker1 = BOOT_RELAY_VALUE;
global.relayValueTracker2 = BOOT_RELAY_VALUE;

global.relayValueShadow1 = [1, 1, 1, 1, 1, 1, 1, 1];
global.relayValueShadow2 = [1, 1, 1, 1, 1, 1, 1, 1];

global.relayValueExternalShadow1 = [1, 1, 1, 1, 1, 1, 1, 1];
global.relayValueExternalShadow2 = [1, 1, 1, 1, 1, 1, 1, 1];

global.relayEventShadow1 = ["B", "B", "B", "B", "B", "B", "B", "B",];
global.relayEventShadow2 = ["B", "B", "B", "B", "B", "B", "B", "B",];

global.relayOnByShadow1 = ["", "", "", "", "", "", "", ""];
global.relayOnByShadow2 = ["", "", "", "", "", "", "", ""];


relayDriver1.scan(function (data) {
    console.log("I2c Scan result " + data); //I2c Scan result
});

relayDriver2.scan(function (data) {
    console.log("I2c Scan result " + data); //I2c Scan result
});

delay(100)
    .then(() => {
        relayDriver1.startFeedBack();
        relayDriver2.startFeedBack();
    });
// delay(3000) //delay for GPIO setup to complete
// 	.then(() => {

//         console.log(Date()+ " ****************************");

//         setInterval(function () {
//             console.log(colors.black.bgGreen("Relay "+count+" "+value));
//             var tindex=0;
//             let relayDriver;
//             if (count < relayDriver1.get().relayEnableCount) {
//                 tindex = count;
//                 relayDriver = relayDriver1;
//             } else {
//                 relayDriver = relayDriver2;
//                 tindex = count - relayDriver1.get().relayEnableCount;
//             }


//             delay(400) //delay for GPIO setup to complete
//                 .then(() => {
//                     relayDriver.relaySwitchExternal(tindex, value);
//                     var internalFeedback = relayDriver.get().relayInternalValue[tindex];
//                     console.log(colors.black.bgRed("Relay External FeedBack " + relayDriver1.get().relayExternalValue + " " + relayDriver2.get().relayExternalValue));
//                     console.log(colors.black.bgBlue("Relay Internal FeedBack " + relayDriver1.get().relayInternalValue + " " + relayDriver2.get().relayInternalValue));
//                     console.log("internalFeedback " + internalFeedback);
//                     console.log("set value " + value);
//                     if (value == 0 && internalFeedback != 1) {
//                         var Error = {
//                             driverName: relayDriver.get().name,
//                             relay: count + 1,
//                             Errors: "Internal feedBack "
//                         }
//                         Errors.push(Error);
//                     }

//                     count++;
//                 });

//              if(count>11){
//                  value=1-value;
//                  count=0;      

//                  console.table(Errors);
//                  Errors=[];
//              }
//         },800);

//     });

function checkRelayFeedback() {
    let internalErrors = [];
    let externalErrors = [];

    function setAllRelays(relayDriver, value) {
        console.log(colors.green.bgBlack(relayDriver.get().name + " set - " + value));
        for (let i = 0; i < relayDriver.get().relayEnableCount; i++) {
            relayDriver.relaySwitchExternal(i, value);
        }
    }

    setAllRelays(relayDriver1, 0);
    setTimeout(() => {
        for (let i = 0; i < relayDriver1.get().relayEnableCount; i++) {
            let internalValue = relayDriver1.get().relayInternalValue[i];
            let externalValue = relayDriver1.get().relayExternalValue[i];

            if (internalValue !== 0) {
                internalErrors.push({
                    driverName: relayDriver1.get().name,
                    relay: i + 1,
                    Errors: "Internal Feedback Error when set to 0"
                });
            } else if (externalValue !== 0) {
                externalErrors.push({
                    driverName: relayDriver1.get().name,
                    relay: i + 1,
                    Errors: "External Feedback Error when set to 0"
                });
            }
        }

        setAllRelays(relayDriver1, 1);
        setTimeout(() => {
            for (let i = 0; i < relayDriver1.get().relayEnableCount; i++) {
                let internalValue = relayDriver1.get().relayInternalValue[i];
                let externalValue = relayDriver1.get().relayExternalValue[i];
                if (internalValue !== 1) {
                    internalErrors.push({
                        driverName: relayDriver1.get().name,
                        relay: i + 1,
                        Errors: "Internal Feedback Error when set to 1"
                    });
                } else if (externalValue !== 1) {
                    externalErrors.push({
                        driverName: relayDriver1.get().name,
                        relay: i + 1,
                        Errors: "External Feedback Error when set to 1"
                    });
                }
            }

            setAllRelays(relayDriver2, 0);
            setTimeout(() => {
                for (let i = 0; i < relayDriver2.get().relayEnableCount; i++) {
                    let internalValue = relayDriver2.get().relayInternalValue[i];
                    let externalValue = relayDriver2.get().relayExternalValue[i];

                    if (internalValue !== 0) {
                        internalErrors.push({
                            driverName: relayDriver2.get().name,
                            relay: relayDriver1.get().relayEnableCount + i + 1,
                            Errors: "Internal Feedback Error when set to 0"
                        });
                    } else if (externalValue !== 0) {
                        externalErrors.push({
                            driverName: relayDriver2.get().name,
                            relay: relayDriver1.get().relayEnableCount + i + 1,
                            Errors: "External Feedback Error when set to 0"
                        });
                    }
                }

                setAllRelays(relayDriver2, 1);
                setTimeout(() => {
                    for (let i = 0; i < relayDriver2.get().relayEnableCount; i++) {
                        let internalValue = relayDriver2.get().relayInternalValue[i];
                        let externalValue = relayDriver2.get().relayExternalValue[i];

                        if (internalValue !== 1) {
                            internalErrors.push({
                                driverName: relayDriver2.get().name,
                                relay: relayDriver1.get().relayEnableCount + i + 1,
                                Errors: "Internal Feedback Error when set to 1"
                            });
                        } else if (externalValue !== 1) {
                            externalErrors.push({
                                driverName: relayDriver2.get().name,
                                relay: relayDriver1.get().relayEnableCount + i + 1,
                                Errors: "External Feedback Error when set to 1"
                            });
                        }
                    }

                    console.table(internalErrors);
                    console.table(externalErrors);

                    internalErrors = [];
                    externalErrors = [];

                    //checkRelayFeedback();
                }, 1500);
            }, 1500);
        }, 1500);
    }, 1500);
}

delay(500)
    .then(() => {
        checkRelayFeedback();
    });
