import i2c from "i2c";
import delay from "delay";
import MCP23017 from "node-mcp23017";
import * as CF from "./commonFunctions.js";

let preFeedback = [];

class RelayController {
    constructor(driveAddress, feedbackAddress, name, relayEnableCount, fbChangeCb, eCallback) {
        var mcp = new MCP23017({
            address: feedbackAddress, //default: 0x20
            device: 1, // 1 for '/dev/i2c-1' on model B | 0 for '/dev/i2c-0' on model A
            // 'ls /dev/i2c*' to find which device file / number you should use
            debug: true, //default: false
        });
        let relayDriver = {
            name: name,
            driveAddress: driveAddress,
            feedbackAddress: feedbackAddress,
            driver: new i2c(driveAddress, { device: "/dev/i2c-1" }),
            feedBack: new i2c(feedbackAddress, { device: "/dev/i2c-1" }),
            extRelayBoardReadyForGPIOEnable: false,
            relayOnByShadow: ["", "", "", "", "", "", "", ""],
            relayLock: [0, 0, 0, 0, 0, 0, 0, 0],
            relayValueShadow: [1, 1, 1, 1, 1, 1, 1, 1],
            relayTimerCancel: [],
            relayValueTracker: BOOT_RELAY_VALUE,
            relayExternalValue: [],
            relayInternalValue: [],
            relayEnableCount: relayEnableCount,
            errorCallback: eCallback,
            error: [],
            feedBackInterval: null,
            feedBackIns: null,
            mcp: mcp,
            feedBackCallback: fbChangeCb,
        };
        this.relayDriver = relayDriver;

        CF.FsLog("RelayDrive initialized Drive Address = " + this.relayDriver.driveAddress + " Feedback Address = " + this.relayDriver.feedbackAddress);
        delay(100).then(() => {
            configure(this.relayDriver);
        });
        delay(500).then(() => {
            setZeroAtStart(this.relayDriver);
        });
    }
    scan(callBack) {
        if (I2C_Busy == 0) {
            I2C_Busy = 1;
            this.relayDriver.driver.scan(function (err, data) {
                I2C_Busy = 0;
                callBack(data);
            });
        }
    }
    get() {
        return this.relayDriver;
    }
    relaySwitchExternal(relay, value) {
        let relayDriver = this.relayDriver;
        console.log(relayDriver.name);
        relaySwitchExternal(relayDriver, relay, value);
        delay(500).then(() => {
            //  getRelayFeedback(relayDriver, relay, function (data) {
            // 	 CF.RelayFeedbackLog(relayDriver.name, relayDriver.relayEnableCount, data);
            //  });
        });
    }
    relayExternalTimerOnOff(relay, value) {
        relayExternalTimerOnOff(this.relayDriver, relay, value);
    }
    relayExternalTimerOnOff100MS(realy, value) {
        relayExternalTimerOnOff100MS(this.relayDriver, relay, value);
    }
    stopAll() {
        stopAll(this.relayDriver);
    }
    getFeedback() {
        getFeedback(this.relayDriver);
    }
    startFeedBack() {
        startFeedBack(this.relayDriver);
    }
    stopFeedBack() {
        stopFeedBack(this.relayDriver);
    }
}

function configure(relayDriver) {
    var BusyCount = 0;
    var idx2External = setInterval(function () {
        if (I2C_Busy == 0) {
            I2C_Busy = 1;
            BusyCount = 0;
            CF.FsLog("configure relayDriver -" + relayDriver.name + " CONFIGURATION ");
            clearInterval(idx2External);
            relayDriver.driver.write([0x00, 0xff], function (err) {
                relayDriver.driver.write([0x01, 0xff], function (err) {
                    relayDriver.driver.write([0x0c, 0xff], function (err) {
                        relayDriver.driver.write([0x0d, 0xff], function (err) {
                            I2C_Busy = 0;
                            relayDriver.driver.write([0x00, 0xff], function (err) {
                                relayDriver.driver.write([0x01, 0xff], function (err) {
                                    relayDriver.driver.write([0x0c, 0xff], function (err) {
                                        relayDriver.driver.write([0x0d, 0xff], function (err) {
                                            delay(1000) //delay for GPIO setup to complete
                                                .then(() => {
                                                    I2C_Busy = 0;
                                                });
                                        }); //pullup enable
                                    }); //pullup enable
                                }); //portB output
                            }); //portA output
                        }); //pullup enable
                    }); //pullup enable
                }); //portB output
            }); //portA output

            for (var i = 0; i < 16; i++) {
                relayDriver.mcp.pinMode(i, relayDriver.mcp.INPUT);
                //mcp.pinMode(i, mcp.INPUT); //if you want them to be inputs
                //mcp.pinMode(i, mcp.INPUT_PULLUP); //if you want them to be pullup inputs
            }
        } else {
            CF.BusyLog("configure I2C_Busy==1 relayDriver -" + relayDriver.name + " BusyCount " + BusyCount);
            BusyCount++;
        }
    }, 100);
}

function setZeroAtStart(relayDriver) {
    CF.Log("setZeroAtStart relayDriver -" + relayDriver.name);
    var BusyCount = 0;
    var idxRCExternal = setInterval(function () {
        if (I2C_Busy == 0) {
            BusyCount = 0;
            I2C_Busy = 1;
            CF.FsLog("setZeroAtStart I2C_Busy==1 relayDriver -" + relayDriver.name);
            clearInterval(idxRCExternal);
            relayDriver.driver.readByte(function (err, resExtRelayControl) {
                // result is single byte
                var newVal = ALLOFF;
                relayDriver.driver.writeByte(newVal, function (err) {
                    relayDriver.extRelayBoardReadyForGPIOEnable = true;
                    relayDriver.driver.readByte(function (err, resRelayControl) {
                        // result is single byte
                        CF.ResponseLog("setZeroAtStart relayDriver -" + relayDriver.name + " response: " + resRelayControl);
                        I2C_Busy = 0;
                    });
                });
            });
        } else {
            if (BusyCount) CF.BusyLog("setZeroAtStart I2C_Busy==1 relayDriver -" + relayDriver.name + " BusyCount : " + BusyCount);
            BusyCount++;
        }
    }, 100);
}

function relaySwitchExternal(relayDriver, relayNumber, value) {
    var BusyCount = 0;
    var idxRC2External = setInterval(function () {
        if (relayDriver.extRelayBoardReadyForGPIOEnable) {
            if (I2C_Busy == 0) {
                I2C_Busy = 1;
                BusyCount = 0;
                clearInterval(idxRC2External);
                relayDriver.driver.readByte(function (err, resRelayControl) {
                    // result is single byte
                    CF.ResponseLog("relaySwitchExternal relayDriver -" + relayDriver.name + " response: " + resRelayControl);
                    var x = 0;
                    if (value == 1) {
                        x = resRelayControl | (1 << relayNumber);
                    } else {
                        x = resRelayControl & ~(1 << relayNumber);
                    }
                    CF.DebugLog("relaySwitchExternal relayDriver -" + relayDriver.name + " write: " + x);
                    relayDriver.driver.writeByte(x, function (err) {
                        if (value == 1) {
                            //inverted
                            relayDriver.relayValueTracker = relayDriver.relayValueTracker | (1 << relayNumber);
                            relayDriver.relayValueShadow[relayNumber] = 1;
                        } else {
                            relayDriver.relayValueTracker = relayDriver.relayValueTracker & ~(1 << relayNumber);
                            relayDriver.relayValueShadow[relayNumber] = 0;
                        }

                        relayDriver.driver.readByte(function (err, resRelayControl) {
                            // result is single byte
                            CF.ResponseLog("relaySwitchExternal relayDriver -" + relayDriver.name + " response: " + resRelayControl);
                            I2C_Busy = 0;
                        });
                    });
                });
            } else {
                if (BusyCount) CF.BusyLog("I2C_Busy==1 relaySwitchExternal relayDriver -" + relayDriver.name + " BusyCount : " + BusyCount);
                BusyCount++;
            }
        } else {
            CF.BusyLog("extRelayBoardReadyForGPIOEnable False relaySwitchExternal relayDriver -" + relayDriver.name);
        }
    }, 100);
}

function relayExternalTimerOnOff(relayDriver, relayNumber, value) {
    CF.DebugLog("relayExternalTimerOnOff relayDriver -" + relayDriver.name + " relay = " + relayNumber + " second " + value);
    if (relayDriver.relayLock[relayNumber] == 0) {
        relaySwitchExternal(relayDriver, relayNumber, TURNON);

        relayDriver.relayOnByShadow[relayNumber] = "schedule";
        var count = 0;
        var intervalObject = setInterval(function () {
            count++;
            if (relayDriver.relayTimerCancel[relayNumber] == 1) {
                CF.DebugLog("External Relay Timer Cancel relayDriver -" + relayDriver.name + " relay = " + relayNumber);
                clearInterval(intervalObject);
                relaySwitchExternal(relayDriver, relayNumber, TURNOFF);
                relayDriver.relayOnByShadow[relayNumber] = "";
                relayDriver.relayLock[relayNumber] = 0;
                relayDriver.relayTimerCancel[relayNumber] = 0;
            }
            if (count >= value) {
                CF.DebugLog("External Stopping Relay relayDriver -" + relayDriver.name + " relay = " + relayNumber);
                clearInterval(intervalObject);
                relaySwitchExternal(relayDriver, relayNumber, TURNOFF);
                relayDriver.relayOnByShadow[relayNumber] = "";
                relayDriver.relayLock[relayNumber] = 0;
                relayDriver.relayTimerCancel[relayNumber] = 0;
            }
        }, 1000);
    } else {
    }
}
function relayExternalTimerOnOff100MS(relayDriver, relayNumber, value) {
    //value in 100 Mili seconds

    CF.DebugLog("relayExternalTimerOnOff100MS relayDriver -" + relayDriver.name + " relay = " + relayNumber + " second " + value);
    relaySwitchExternal(relayNumber, TURNON);
    var count = 0;
    var intervalObject = setInterval(function () {
        count++;

        if (count >= value) {
            CF.DebugLog("External Stopping Relay " + relayNumber);
            clearInterval(intervalObject);
            relaySwitchExternal(relayNumber, TURNOFF);
            relayDriver.relayOnByShadow[relayNumber] = "";
        }
    }, 100);
}
function stopAll(relayDriver) {
    var BusyCount = 0;
    var idxRCExternal = setInterval(function () {
        if (I2C_Busy == 0) {
            BusyCount = 0;
            I2C_Busy = 1;
            CF.FsLog("stopAll I2C_Busy==1 relayDriver -" + relayDriver.name);
            clearInterval(idxRCExternal);
            relayDriver.driver.readByte(function (err, resExtRelayControl) {
                // result is single byte
                var newVal = ALLOFF;
                relayDriver.driver.writeByte(newVal, function (err) {
                    relayDriver.extRelayBoardReadyForGPIOEnable = true;
                    relayDriver.driver.readByte(function (err, resRelayControl) {
                        CF.ResponseLog("stopAll relayDriver -" + relayDriver.name + " response: " + resRelayControl);
                        for (var i = 0; i < relayDriver.relayEnableCount; i++) {
                            relayDriver.relayValueShadow[i] = 1;
                            relayDriver.relayOnByShadow[i] = "";
                        }
                        I2C_Busy = 0;
                    });
                });
            });
        } else {
            if (BusyCount) CF.BusyLog("stopAll I2C_Busy==1 relayDriver -" + relayDriver.name + " BusyCount : " + BusyCount);
            BusyCount++;
        }
    }, 100);
}
function getFeedback(relayDriver) {
    clearInterval(relayDriver.feedBackIns);
    var BusyCount = 0;

    relayDriver.feedBackIns = setInterval(function () {
        if (I2C_Busy == 0) {
            I2C_Busy = 1;
            BusyCount = 0;
            CF.FsLog("EXTERNAL RELAY1 feedBack1 READ ");
            clearInterval(relayDriver.feedBackIns);
            relayDriver.feedBack.write([0x00, 0xff], function (err) {
                relayDriver.feedBack.write([0x01, 0xff], function (err) {
                    relayDriver.feedBack.write([0x0c, 0xff], function (err) {
                        relayDriver.feedBack.write([0x0d, 0xff], function (err) {
                            delay(100) //delay for above to propagate
                                .then(() => {
                                    relayDriver.feedBack.writeByte(0x12, function (err) {
                                        relayDriver.feedBack.read(1, function (err, res) {
                                            relayDriver.relayExternalValue = CF.ByteToArray(255 - res);

                                            CF.ByteToArray(relayDriver.relayValueTracker).forEach((element, index) => {
                                                if (index < relayDriver.relayEnableCount) {
                                                    relayDriver.mcp.digitalRead(Number(index) + 8, function (pin, err, mcpvalue) {
                                                        console.log("index " + index + " element " + element + " relayDriver.relayExternalValue " + relayDriver.relayExternalValue[index] + " mcp " + pin + " value " + mcpvalue);
                                                    });

                                                    if (element != relayDriver.relayExternalValue[index]) {
                                                        let error = {};
                                                        error.error = "E_" + (index + 1);
                                                        error.time = new Date();
                                                        error.driver = relayDriver.name;
                                                        if (relayDriver.error.findIndex((item) => item.error === error.error) < 0) {
                                                            CF.pushA(relayDriver.error, error);
                                                            if (relayDriver.error.length > 0) {
                                                                relayDriver.errorCallback(relayDriver.error);
                                                            }
                                                        }
                                                    } else {
                                                        relayDriver.error.splice(
                                                            relayDriver.error.findIndex((item) => item.error === "E_" + (index + 1)),
                                                            1
                                                        );
                                                    }
                                                }
                                            });
                                            I2C_Busy = 0;
                                        });
                                    }); //read portA
                                });
                        }); //pullup enable
                    }); //pullup enable
                }); //portB output
            }); //portA output
        } else {
            if (BusyCount) CF.BusyLog("I2C_Busy==1 getFeedback relayDriver -" + relayDriver.name + " BusyCount " + BusyCount);
            BusyCount++;
        }
    }, I2CRETRYDELAY);
}

function TestFeedback(relayDrive) {
    for (var i = 0; i < relayDrive.relayEnableCount; i++) {
        var feedbackChangeflag = false;
        getRelayFeedback(relayDrive, i, function (data) {
            if (relayDrive.relayExternalValue[data.relay] != data.externalFeedback || relayDrive.relayInternalValue[data.relay] != data.internalFeedback) {
                if (data.relay <= relayDrive.relayEnableCount - 1) {
                    relayDrive.feedBackCallback(data.relay);
                }
            }
            relayDrive.relayExternalValue[data.relay] = data.externalFeedback;
            relayDrive.relayInternalValue[data.relay] = data.internalFeedback;
            CF.RelayFeedbackLog(relayDrive.name, relayDrive.relayEnableCount, data);

            if (typeof preFeedback != "undefined") {
                if (preFeedback[data.relay] != data.externalFeedback) {
                    preFeedback[data.relay] = data.externalFeedback;
                    feedbackChangeflag = true;
                }
            } else {
                preFeedback = [];
                feedbackChangeflag = true;
            }
        });
    }

    // function drawTable(relayDrive){
    // 	var feedback={};
    // 	feedback.Internal= internalFeedback;
    // 	feedback.External= externalFeedback;
    // 	CF.FeedbackTable(relayDrive.name,CF.ByteToArray(relayDrive.relayValueTracker),internalFeedback,externalFeedback);
    // 	//console.table(feedback);
    // }
}

function getRelayFeedback(relayDrive, relay, callBack) {
    let feedback = {};
    feedback.driver = relayDrive.name;
    feedback.relay = relay;
    feedback.setvalue = relayDrive.relayValueShadow[relay];

    relayDrive.mcp.digitalRead(relay, function (pin, err, value1) {
        relayDrive.mcp.digitalRead(Number(relay) + 8, function (pin, err, value2) {
            feedback.internalFeedback = value2 ? 0 : 1;
            feedback.externalFeedback = value1 ? 0 : 1;

            if (feedback.internalFeedback != feedback.setvalue) {
                let error = {};
                error.error = "I_" + (relay + 1);
                error.time = new Date();
                error.driver = relayDrive.name;
                error.feedback = feedback;
                CF.pushA(relayDrive.error, error);
                //relayDrive.errorCallback(relayDrive.error);
                //	console.table(error);
            }
            if (feedback.externalFeedback != feedback.setvalue) {
                let error = {};
                error.error = "E_" + (relay + 1);
                error.time = new Date();
                error.driver = relayDrive.name;
                error.feedback = feedback;
                CF.pushA(relayDrive.error, error);
                //relayDrive.errorCallback(relayDrive.error);
                //console.table(error);
            }

            callBack(feedback);
        });
    });
}

function startFeedBack(relayDriver) {
    CF.Log("Feedback start relayDriver " + relayDriver.name);
    var relay = 0;
    relayDriver.feedBackInterval = setInterval(function () {
        TestFeedback(relayDriver);
        //getFeedback(relayDriver);
        // if (I2C_Busy == 0) {
        // 	I2C_Busy = 1;
        // getRelayFeedback(relayDriver,relay,function(data){
        // 	console.log("drive "+relayDriver.name+" relay "+(relay +1));
        // 	relay++;
        // 	I2C_Busy=0;
        // 	if(relay>=relayDriver.relayEnableCount)relay=0;
        // });
        //	}
    }, 500);
}

function stopFeedBack(relayDriver) {
    clearInterval(relayDriver.feedBackInterval);
}
export default RelayController;
