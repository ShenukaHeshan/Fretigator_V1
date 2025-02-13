import delay from "delay";
import dateFormat from "dateformat";
import gpio from "rpi-gpio";
import schedule from "node-schedule";
import * as child_process from "child_process";
import colors from "colors";
import { WebSocketServer, WebSocket } from "ws";

import "./include/constants.js";
import ApiService from "./include/ApiService.js";
import SerialHandler from "./include/SerialHandler.js";
import ErrorHandler from "./include/ErrorHandler.js";
import SensorHandler from "./include/SensorHandler.js";
import VenturiHandler from "./include/VenturiHandler.js";
import relayDrive from "./include/RelayController.js";
import ExternalNode from "./include/ExternalNode.js";
import MqttHandler from "./include/MqttHandler.js";
import RelaySchedule from "./include/RelaySchedule.js";
import * as fileHandler from "./include/FileHandler.js";
import * as CF from "./include/commonFunctions.js";

let mqttHandler;
let venturiHandler;
let sensorHandler;
let relaySchedule;
let apiService = new ApiService(NODE_ID);
let serialHandler = new SerialHandler();
let errorHandler = new ErrorHandler(apiService, true);
CF.setDebugMode(false);

//variables
let externalNodes = [];
let fertigateScheduleList = [];
let loopDrainScheduleList = [];
let remainingFertigationCycle = [];
let fertigationCycleData = {};

let dosingInterval = [];
var dosingBusy = false;
var rateModeDone = false;
var timeModeDone = false;
var ratioModeDone = false;
var ecModeDone = false;
var phModeDone = false;
var totalEC = 0;

var currentLoopIndex = null;
var mixingTankLevel = 0;
var mixingFlowMeterValue = 0;
var dosingStep = null;
var CURRENT_MODE = null;
var currentRecipeId = null;
var setTankLevel = null;
var mqttInterval = setInterval(publishMqtt, 5000);
setInterval(formatSensorData, 300000);

// dosing variables
var ecReductionRound = 0;

//flags
var powerOnFlag = false;
var safetyStopFlag = false;
var phValueStable5SecFlag = false;
var ecValueStable5SecFlag = false;
var preStageFlag = false;
var postStageFlag = false;
var emptyMixingTankFlag = false;
var fillWaterStateFlag = false;
var nStateFlag = false;
var isMultiElementStateCompleted = false;
var fertigateStateFlag = false;
var waterBalanceState = false;
var cleanSensorWaitState = false;
var cleanSensorState = false;
var ecReduceStateFlag = false;
var ecFillWaterStateFlag = false;
var drainTankFlag = false;
var relayStateFlag = false;
var phBalanceState = false;

let relayDriver1 = new relayDrive(
    0x21,
    0x27,
    "1",
    8,
    function (index) {
        if (CURRENT_STATE > POWER_ON_STATE || CURRENT_STATE != LOCK_STATE) {
            if (typeof AiGrowJson.deviceArray[index] != "undefined") formatDeviceData(AiGrowJson.deviceArray[index].deviceID);
        }
    },
    function (err) {
        err.forEach((element) => {
            CF.ErrorLog("driver " + element.driver + "  " + element.error);
        });
    }
);

let relayDriver2 = new relayDrive(
    0x22,
    0x20,
    "2",
    4,
    function (index) {
        if (CURRENT_STATE > POWER_ON_STATE || CURRENT_STATE != LOCK_STATE) {
            if (typeof AiGrowJson.deviceArray[index + 8] != "undefined") formatDeviceData(AiGrowJson.deviceArray[index + 8].deviceID);
        }
    },
    function (err) {
        err.forEach((element) => {
            CF.ErrorLog("driver " + element.driver + "  " + element.error);
        });
    }
);

gpio.setMode(gpio.MODE_BCM);

// Main relay
gpio.setup(20, gpio.DIR_OUT, () => {
    gpio.write(20, 0, (err) => {
        if (err) throw err;
        CF.DebugLog(dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT") + ` Pin 38 initialize to 0`);
    });
});
// Alarm relay
gpio.setup(11, gpio.DIR_OUT, () => {
    gpio.write(11, 0, (err) => {
        if (err) throw err;
        CF.DebugLog(dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT") + ` Pin 23 initialize to 0`);
    });
});

relayDriver1.scan(function (data) {
    console.log("I2c Scan result " + data);
});

relayDriver2.scan(function (data) {
    console.log("I2c Scan result " + data);
});

// Create a WebSocket server
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
    console.log("New WebSocket connection established.");

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);
            console.log("WebSocket message received:", data);

            // Handle commands
            switch (data.command) {
                case "RECIPE_UPDATE":
                    updateRecipe(data.data);
                    break;
                case "UI_COMMANDS":
                    handleUICommands(data.data);
                    break;
                case "START_BUTTON":
                    handleFertigationCommand(data.data);
                    break;
                default:
                    console.warn("Unknown command:", data.command);
            }
        } catch (error) {
            console.error("Error parsing WebSocket message:", error);
        }
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
    });

    ws.on("close", (code, reason) => {
        console.log(`WebSocket connection closed. Code: ${code}, Reason: ${reason}`);
    });
});

function publishWebSocketMessage(data) {
    console.log(`Total connected WebSocket clients: ${wss.clients.size}`);

    wss.clients.forEach((client) => {
        if (client.readyState == WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

setInterval(() => {
    if (AiGrowJson) {
        const { dataBus, Mqtt, ...rest } = AiGrowJson;
        const data = JSON.parse(JSON.stringify(rest));

        data.DP_status = {
            DP1_status: 0,
            DP2_status: 0,
            DP3_status: 0,
            DP4_status: 0,
        };
        data.FM1_reading = 0;
        data.FM2_reading = 0;
        data.FM3_reading = 0;
        data.FM4_reading = 0;
        data.FM5_reading = 0;
        data.MP1_STATUS = 0;
        data.LDP1_STATUS = 0;
        data.EC_status = EC_VALUE;
        data.PH_status = PH_VALUE;
        data.EC_reading = EC_VALUE;
        data.PH_reading = PH_VALUE;
        data.EC_start = fertigationCycleData?.startEC;
        data.PH_start = fertigationCycleData?.startPH;
        data.EC_set = targetEC;
        data.PH_set = targetPH;
        data.sync = dateFormat(new Date(), "h:MM:ss TT");
        data.phCalV = phMv;
        data.status = CURRENT_STATE;

        publishWebSocketMessage(data);
    }
}, 1000);

CURRENT_STATE = DEFAULT_STATE;
delay(2000).then(() => {
    console.log("Power on " + dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT"));
    CURRENT_STATE = POWER_ON_STATE;
});

setInterval(() => {
    if (PREVIOUS_STATE != CURRENT_STATE) {
        console.log("State Change " + PREVIOUS_STATE + " -> " + CURRENT_STATE);
        PREVIOUS_STATE = CURRENT_STATE;
        stateTimer = 0;
        publishMqtt();
    }
    if (CURRENT_STATE != IDLE_STATE) {
        stateTimer++;
    }

    if (CURRENT_STATE == POWER_ON_STATE) {
        CF.CurrentStateLog("POWER_ON_STATE", stateTimer);
        if (!powerOnFlag) {
            powerOnFlag = true;
            apiService.getNodeINIAiGrow((response) => {
                if (response && response.success) {
                    fileHandler.readFile(
                        FILE_INI,
                        function (data) {
                            AiGrowJson = updateAiGrowJson(response, data);
                        },
                        function (error) {
                            CF.ErrorLog("fertigation Can't read back up Ini.", error);
                            AiGrowJson = response;
                        }
                    );
                    fileSave(AiGrowJson);
                } else {
                    CF.ErrorLog("Fertigator getting backup ini.");
                    fileHandler.readFile(
                        FILE_INI,
                        function (data) {
                            AiGrowJson = data;
                        },
                        function (error) {
                            CF.ErrorLog("System Error.", error);
                            process.exit();
                        }
                    );
                }

                if (AiGrowJson) {
                    printInfo(AiGrowJson);

                    fertigateSchedule();

                    gpio.write(20, 1, (err) => {
                        if (err) CF.ErrorLog(`Error writing 1 to GPIO pin 20 `, err);
                    });

                    venturiHandler = new VenturiHandler(serialHandler);

                    sensorHandler = new SensorHandler(
                        (sensor) => handleError(SENSOR_ERROR, { sensor }), // Sensor error
                        () => handleError(SERIAL_ERROR) // Serial error
                    );

                    serialHandler.initializeSerial(
                        //handle serial message
                        function (path, serialData) {
                            if (serialData.hasOwnProperty("LS")) {
                                const levelSensorArray = serialData.LS;

                                if (serialData.R == 1) {
                                    if (serialData.S == 2) {
                                        AiGrowJson.sensorArray.forEach((sensor) => {
                                            if (sensor.type_id == 31 && sensor.enable == 1) {
                                                if (sensor.receiver_address == serialData.S) {
                                                    if (levelSensorArray.length > sensor.receiver_index) {
                                                        sensor.sensorValue = levelSensorCalculate(levelSensorArray[sensor.receiver_index], sensor.sensorADC_WET, sensor.sensorADC_EMPTY, sensor.sensorADC_DRY);
                                                        sensor.sensorDetect = 1;
                                                        sensorHandler.monitorSensor(sensor);
                                                        if (sensor.sensorDisplayLCD) {
                                                            CF.SensorDataLog(sensor);
                                                        }
                                                    } else {
                                                        console.warn("Level sensor Not Installed.");
                                                    }
                                                }
                                            }
                                        });
                                    } else if (serialData.S > 2) {
                                        const externalNode = externalNodes.find((element) => serialData.S == element.getAddress());
                                        if (externalNode) {
                                            const sensorArray = externalNode.getNode().sensorArray;
                                            sensorArray.forEach((sensor) => {
                                                if (sensor.type_id == 31 && sensor.enable == 1) {
                                                    if (sensor.receiver_address == serialData.S) {
                                                        if (levelSensorArray.length > sensor.receiver_index) {
                                                            sensor.sensorValue = levelSensorCalculate(levelSensorArray[sensor.receiver_index], sensor.sensorADC_WET, sensor.sensorADC_EMPTY, sensor.sensorADC_DRY);
                                                            sensor.sensorDetect = 1;
                                                            sensorHandler.monitorSensor(sensor);
                                                            if (sensor.sensorDisplayLCD) {
                                                                CF.SensorDataLog(sensor);
                                                            }
                                                        } else {
                                                            console.warn("External Node Level sensor Not Installed.");
                                                        }
                                                    }
                                                }
                                            });
                                        }
                                    }

                                    mixingTankLevel = getSensorValue(AiGrowJson.current_node_id, mixingTankLevelSensorId);
                                    // set freshWaterTankLevel to the maximum level, If it is 0 (Defailt 0)
                                    AiGrowJson.freshWaterTankLevel = freshwaterTankLevelSensorId === 0 ? AiGrowJson.freshWaterTankMaxLevel : getSensorValue(AiGrowJson.current_node_id, freshwaterTankLevelSensorId);

                                    for (var i = 0; i < AiGrowJson.numberOfLoops; i++) {
                                        AiGrowJson.loopSchedules[i].localTankWaterLevel = getSensorValue(AiGrowJson.loopSchedules[i].listenTo_FM_LS_CurrentNodeID, AiGrowJson.loopSchedules[i].localTankWaterLevelDeviceID);
                                    }
                                }
                            }

                            if (serialData.hasOwnProperty("FM")) {
                                const flowMetersArray = serialData.FM;
                                if (serialData.R == 1) {
                                    if (serialData.S == 2) {
                                        AiGrowJson.sensorArray.forEach((sensor) => {
                                            if (sensor.type_id == 25 && sensor.enable == 1) {
                                                if (sensor.receiver_address == serialData.S) {
                                                    if (flowMetersArray.length > sensor.receiver_index) {
                                                        sensor.sensorValue = flowMetersArray[sensor.receiver_index];
                                                        sensor.sensorDetect = 1;
                                                        if (sensor.sensorDisplayLCD) {
                                                            CF.SensorDataLog(sensor);
                                                        }
                                                    } else {
                                                        console.warn("Flow Meter sensor Not Installed.");
                                                    }
                                                }
                                            }
                                        });
                                    } else if (serialData.S > 2) {
                                        const externalNode = externalNodes.find((element) => serialData.S == element.getAddress());
                                        if (externalNode) {
                                            const sensorArray = externalNode.getNode().sensorArray;
                                            sensorArray.forEach((sensor) => {
                                                if (sensor.type_id == 25 && sensor.enable == 1) {
                                                    if (sensor.receiver_address == serialData.S) {
                                                        if (flowMetersArray.length > sensor.receiver_index) {
                                                            sensor.sensorValue = flowMetersArray[sensor.receiver_index];
                                                            sensor.sensorDetect = 1;
                                                            if (sensor.sensorDisplayLCD) {
                                                                CF.SensorDataLog(sensor);
                                                            }
                                                        } else {
                                                            console.warn("External Node Flow Meter sensor Not Installed.");
                                                        }
                                                    }
                                                }
                                            });
                                        }
                                    }

                                    mixingFlowMeterValue = getSensorValue(AiGrowJson.current_node_id, mixingFlowMeterSensorId);

                                    for (var i = 0; i < AiGrowJson.numberOfLoops; i++) {
                                        AiGrowJson.loopSchedules[i].loopInFlowMeterValue = getSensorValue(AiGrowJson.loopSchedules[i].listenTo_FM_LS_CurrentNodeID, AiGrowJson.loopSchedules[i].loopInFlowMeterDeviceID);
                                        AiGrowJson.loopSchedules[i].loopOutFlowMeterValue = getSensorValue(AiGrowJson.loopSchedules[i].listenTo_FM_LS_CurrentNodeID, AiGrowJson.loopSchedules[i].loopOutFlowMeterDeviceID);
                                    }
                                }
                            }

                            if (serialData.hasOwnProperty("DAC")) {
                                venturiHandler.updateVenturiState(serialData.DAC);
                            }

                            if (serialData.hasOwnProperty("EC") && serialData.hasOwnProperty("PH")) {
                                // Update EC and PH values
                                EC_VALUE = serialData.EC;
                                PH_VALUE = serialData.PH;
                                phMv = serialData.ph_mV;
                                ecMv = serialData.ec_mv;

                                EC_ERROR = serialData.ec_error;

                                const EcPH = {
                                    EC: EC_VALUE,
                                    PH: PH_VALUE,
                                    ec_mv: ecMv,
                                    ph_mV: phMv,
                                    ph_4_mV: serialData.ph_4_mV,
                                    ph_7_mV: serialData.ph_7_mV,
                                    Time: CF.formatTimeDisplay(new Date()),
                                };
                                CF.EcPhLog(EcPH);

                                // Update sensor array values
                                AiGrowJson.sensorArray.forEach((sensor) => {
                                    if (sensor.receiver_address == serialData.S && sensor.enable == 1) {
                                        if (sensor.type_id == 11) {
                                            sensor.sensorValue = EC_VALUE;
                                            sensor.sensorDetect = 1;
                                        } else if (sensor.type_id == 12) {
                                            sensor.sensorValue = PH_VALUE;
                                            sensor.sensorDetect = 1;
                                        } else if (sensor.type_id == 28) {
                                            sensor.sensorValue = serialData.temp;
                                            sensor.sensorDetect = 1;
                                        }
                                        sensorHandler.monitorSensor(sensor);
                                    }
                                });

                                // Set stable flags
                                if (serialData.ph_done == true) {
                                    phValueStable5SecFlag = true;
                                }

                                if (serialData.ec_done == true) {
                                    ecValueStable5SecFlag = true;
                                }
                            }

                            if (serialData.hasOwnProperty("ex_fb")) {
                                if (serialData.R == 1 && serialData.S > 2) {
                                    const externalNode = externalNodes.find((element) => serialData.S == element.getAddress());
                                    if (externalNode) {
                                        const nodeDeviceArray = externalNode.getNode().deviceArray;

                                        externalNode.setLastFetch();

                                        nodeDeviceArray.forEach((device, index) => {
                                            if (index < serialData.ex_fb.length) {
                                                const sensorValue = serialData.ex_fb[index];

                                                if (device.sensorValue != sensorValue) {
                                                    device.sensorValue = sensorValue;
                                                    externalNode.publishMqtt();
                                                }

                                                let additional_data = device.additional_data || "0,0,0,0";
                                                const spitedData = additional_data.split(",");

                                                spitedData[0] = spitedData[0] || 0;
                                                spitedData[1] = spitedData[1] || 0;
                                                spitedData[2] = spitedData[2] || 0;

                                                device.additional_data = `${spitedData[0]},${spitedData[1]},${spitedData[2]},${sensorValue}`;
                                            }
                                        });

                                        AiGrowJson.loopSchedules.forEach((loop) => {
                                            if (loop.loopCurrentNodeID == externalNode.getId()) {
                                                loop.loopOutDeviceValue = externalNode.getDeviceValue(loop.loopOutDeviceID);
                                                loop.loopDrainPumpRelayValue = externalNode.getDeviceValue(loop.loopDrainPumpRelayDeviceID);
                                            }
                                        });
                                    }
                                }
                            }

                            if (serialData.hasOwnProperty("in_fb")) {
                                if (serialData.R == 1 && serialData.S > 2) {
                                    const externalNode = externalNodes.find((element) => serialData.S == element.getAddress());

                                    if (externalNode) {
                                        const nodeDeviceArray = externalNode.getNode().deviceArray;

                                        nodeDeviceArray.forEach((device, index) => {
                                            if (index < serialData.in_fb.length) {
                                                let additional_data = device.additional_data || "0,0,0,0";
                                                var spitedData = additional_data.split(",");

                                                spitedData[1] = spitedData[1] || 0;
                                                spitedData[2] = spitedData[2] || 0;
                                                spitedData[3] = spitedData[3] || 0;

                                                device.additional_data = `${serialData.in_fb[index]},${spitedData[1]},${spitedData[2]},${spitedData[3]}`;
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    );

                    relaySchedule = new RelaySchedule(AiGrowJson.deviceArray, (deviceID, scheduleIndex, relaySchedule, duration) => {
                        const relayIndex = getRelayIndex(deviceID);
                        if (relayIndex == -1) return;

                        const device = AiGrowJson.deviceArray[relayIndex];
                        if (device.userInvolveValue == "auto" && device.remoteEnable == 1) {
                            relayTimerOnOffWrapper(relayIndex, duration);
                        }
                    });

                    mqttHandler = new MqttHandler(
                        AiGrowJson,
                        //handle mqtt message
                        function (data) {
                            if (data.targetCurrentNodeID == AiGrowJson.current_node_id) {
                                if (data.command == "USERSET") {
                                    const relayIndex = getRelayIndex(data.device_id);
                                    if (relayIndex == -1) return;

                                    const updateRelayDevice = (value, action) => {
                                        const relay = AigrowJson.deviceArray[relayIndex];
                                        relay.userInvolveValue = value;
                                        relay.userInvolveTime = new Date();
                                        relaySwitchExternalWrapper(relayIndex, action);
                                    };

                                    if (data.value == "on" && AiGrowJson.deviceArray[relayIndex].remoteEnable == 1) {
                                        updateRelayDevice(data.value, TURNON);
                                    } else if (data.value == "off" && AiGrowJson.deviceArray[relayIndex].remoteEnable == 1) {
                                        updateRelayDevice(data.value, TURNOFF);
                                    } else if (data.value == "auto" && AiGrowJson.deviceArray[relayIndex].remoteEnable == 1) {
                                        updateRelayDevice(data.value, TURNOFF);
                                        relaySchedule.reschedule(AiGrowJson.deviceArray[relayIndex]);
                                    }
                                } else if (data.command == "FERTIGATE") {
                                    fertigationStart({
                                        loopIndex: data.value,
                                        fertigationMode: "FERTIGATE",
                                        recipeId: data.recipeId,
                                        triggeredBy: "USER",
                                    });
                                } else if (data.command == "DRAIN") {
                                    fertigationStart({
                                        loopIndex: data.value,
                                        fertigationMode: "DRAIN",
                                        triggeredBy: "USER",
                                    });
                                } else if (data.command == "FRESHWATER") {
                                    fertigationStart({
                                        loopIndex: data.value,
                                        fertigationMode: "FRESHWATER",
                                        triggeredBy: "USER",
                                    });
                                } else if (data.command == "FERTIGATEWITHDRAIN") {
                                    fertigationStart({
                                        loopIndex: data.value,
                                        fertigationMode: "FERTIGATEWITHDRAIN",
                                        recipeId: data.recipeId,
                                        triggeredBy: "USER",
                                    });
                                } else if (data.command == "FRESHWATERWITHDRAIN") {
                                    fertigationStart({
                                        loopIndex: data.value,
                                        fertigationMode: "FRESHWATERWITHDRAIN",
                                        triggeredBy: "USER",
                                    });
                                } else if (data.command == "STOP") {
                                    stopFertigation();
                                } else if (data.command == "WRITE") {
                                    if (data.value == TURNON || data.value == TURNOFF) {
                                        const relayIndex = getRelayIndex(data.device_id);
                                        if (relayIndex == -1) return;
                                        relaySwitchExternalWrapper(relayIndex, data.value);
                                    }
                                } else if ("GETMQTT") {
                                    clearInterval(mqttInterval);
                                    mqttInterval = setInterval(publishMqtt, 2500);
                                    setTimeout(() => {
                                        clearInterval(mqttInterval);
                                        mqttInterval = setInterval(publishMqtt, 5000);
                                    }, 300 * 1000);
                                }
                            } else {
                                const externalNode = externalNodes.find((element) => data.targetCurrentNodeID == element.getId());
                                if (externalNode) {
                                    if (data.command == "USERSET") {
                                        externalNode.userSet(data.device_id, data.value);
                                    } else if (data.command == "GETMQTT") {
                                        externalNode.getMqttRequest();
                                    }
                                }
                            }

                            if (data.command == "GETUPDATEINI") {
                                apiService.getNodeINIAiGrow(function (response) {
                                    if (response && response.success) {
                                        AiGrowJson = updateAiGrowJson(response, AiGrowJson);
                                        fertigateSchedule();
                                    }
                                });
                            } else if (data.command == "RESET") {
                                systemRestart();
                            } else if (data.command == "REBOOT") {
                                systemReboot();
                            }
                        },
                        //mqtt error
                        function () {
                            apiService.getNodeINIAiGrow(function (response) {
                                if (response && response.success) {
                                    AiGrowJson = updateAiGrowJson(response, AiGrowJson);
                                    fertigateSchedule();
                                }
                            });
                        }
                    );

                    AiGrowJson.dataBus.forEach((element) =>
                        externalNodes.push(
                            new ExternalNode(element, serialHandler, mqttHandler, () => {
                                handleError(SERIAL_ERROR);
                            })
                        )
                    );

                    delay(2500).then(() => {
                        relayDriver1.startFeedBack();
                        relayDriver2.startFeedBack();

                        CURRENT_STATE = LOCK_STATE;
                    });
                }
            });
        }
    } else if (CURRENT_STATE == LOCK_STATE) {
        CF.CurrentStateLog("LOCK_STATE", stateTimer);
        if (sensorHandler.isSerialActive()) {
            if (externalNodes.every((node) => node.isSerialActive())) {
                const status = AiGrowJson.status?.[0];
                if (status && status.STATE > IDLE_STATE && ![ERROR_STATE, SAFETY_CHECK].includes(status.STATE)) {
                    if (status.mode !== undefined && status.currentLoop != null && status.recipeId != null) {
                        fertigationStart({
                            loopIndex: status.currentLoop,
                            fertigationMode: status.mode,
                            recipeId: status.recipeId,
                            triggeredBy: "POWER ON",
                        });
                    } else {
                        CURRENT_STATE = IDLE_STATE;
                    }
                } else {
                    CURRENT_STATE = IDLE_STATE;
                }
            } else {
                console.log("Waiting for manifold serial...");
            }
        } else {
            console.log("Waiting for Level Sensor...");
        }
    } else if (CURRENT_STATE == IDLE_STATE) {
        CF.CurrentStateLog("IDLE_STATE", stateTimer);
    } else if (CURRENT_STATE == PRE_FERTIGATE_STATE) {
        CF.CurrentStateLog("PRE_FERTIGATE_STATE", stateTimer);
        if (!preStageFlag) {
            preStageFlag = true;
            let longestOnRelay = getLongestPreStageRelaySettings();
            CF.DebugLog(longestOnRelay);
            if (longestOnRelay != null) {
                customRelaySettings.forEach((element) => {
                    if ([1, 2, 6].indexOf(element.mode) > -1) {
                        if (element.preStageTime == longestOnRelay.preStageTime) {
                            if (CURRENT_STATE == PRE_FERTIGATE_STATE) {
                                relayOnValueChecker(element, TURNON, function (relayFeedBack) {
                                    CF.Log(`Mode: ${element.mode}, Node ID: ${element.currentNodeId}, Device ID: ${element.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedBack}`);
                                });
                            }
                        }
                    }
                });
                secondsTimer(
                    longestOnRelay.preStageTime,
                    function () {
                        customRelaySettings.forEach((element) => {
                            if ([1].indexOf(element.mode) > -1) {
                                relayOnValueChecker(element, TURNOFF, function (relayFeedBack) {
                                    CF.Log(`Mode: ${element.mode}, Node ID: ${element.currentNodeId}, Device ID: ${element.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedBack}`);
                                });
                            }
                            if ([2, 3, 4, 6].indexOf(element.mode) > -1) {
                                if (CURRENT_STATE == PRE_FERTIGATE_STATE) {
                                    relayOnValueChecker(element, TURNON, function (relayFeedBack) {
                                        CF.Log(`Mode: ${element.mode}, Node ID: ${element.currentNodeId}, Device ID: ${element.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedBack}`);
                                    });
                                }
                            }
                        });
                        delay(10000).then(() => {
                            if (CURRENT_STATE == PRE_FERTIGATE_STATE) CURRENT_STATE = RELAY_STATE;
                        });
                    },
                    function (remainTime) {
                        customRelaySettings.forEach((element) => {
                            if ([1, 2, 6].indexOf(element.mode) > -1) {
                                if (element.preStageTime == remainTime) {
                                    if (CURRENT_STATE == PRE_FERTIGATE_STATE) {
                                        relayOnValueChecker(element, TURNON, function (relayFeedBack) {
                                            CF.Log(`Mode: ${element.mode}, Node ID: ${element.currentNodeId}, Device ID: ${element.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedBack}`);
                                        });
                                    }
                                }
                            }
                        });
                    }
                );
            } else {
                customRelaySettings.forEach((element) => {
                    if ([3, 4].indexOf(element.mode) > -1) {
                        if (CURRENT_STATE == PRE_FERTIGATE_STATE) {
                            relayOnValueChecker(element, TURNON, function (relayFeedBack) {
                                CF.Log(`Mode: ${element.mode}, Node ID: ${element.currentNodeId}, Device ID: ${element.deviceId}, Feedback: ${relayFeedBack}`);
                            });
                        }
                    }
                });
                delay(8000).then(() => {
                    if (CURRENT_STATE == PRE_FERTIGATE_STATE) CURRENT_STATE = RELAY_STATE;
                });
            }
        }
    } else if (CURRENT_STATE == RELAY_STATE) {
        CF.CurrentStateLog("RELAY_STATE", stateTimer);
        if (!relayStateFlag) {
            relayStateFlag = true;
            if (AiGrowJson.majorVersion == MIXING_TYPE) {
                if (CURRENT_STATE == RELAY_STATE) {
                    CURRENT_STATE = FILL_WATER_STATE;
                }
            } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                loopOutputValveEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                    if (relayFeedback) {
                        if (CURRENT_STATE == RELAY_STATE) {
                            CURRENT_STATE = FILL_WATER_STATE;
                        }
                    }
                });
            }
        }
    } else if (CURRENT_STATE == FILL_WATER_STATE) {
        CF.CurrentStateLog("FILL_WATER_STATE", stateTimer);

        const recipeList = AiGrowJson.loopSchedules[currentLoopIndex].loopMultiRecipe.find((recipe) => recipe.id === currentRecipeId)?.recipe_list || [];
        const isTimeOrRate = recipeList.some((dosingStep) => ["TIME", "RATE"].includes(dosingStep.mode));
        const targetLevel = isTimeOrRate ? setTankLevel / 2 : setTankLevel;

        if (!fillWaterStateFlag) {
            fillWaterStateFlag = true;
            if (getCurrentLevel() < targetLevel) {
                sensorHandler.enableSensorCheck(mixingTankLevelSensorId);

                relayOnValueChecker(freshWaterSolenoidRelay, TURNON, function (freshWaterSolenoidRelayState) {
                    if (freshWaterSolenoidRelayState) {
                        relayOnValueChecker(mixingSolenoidRelay, TURNON, function (mixingSolenoidRelayState) {
                            if (mixingSolenoidRelayState) {
                                relayOnValueChecker(freshWaterPumpRelay, TURNON, function (freshWaterPumpRelayState) {
                                    freshWaterPumpStatus = freshWaterPumpRelayState;
                                    if (freshWaterPumpRelayState) {
                                        const interval = setInterval(() => {
                                            if (CURRENT_STATE != FILL_WATER_STATE) {
                                                sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                                clearInterval(interval);
                                                return;
                                            }
                                            if (getCurrentLevel() >= targetLevel) {
                                                sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                                clearInterval(interval);

                                                relayOnValueChecker(freshWaterPumpRelay, TURNOFF, function (freshWaterPumpRelayState) {
                                                    freshWaterPumpStatus = freshWaterPumpRelayState;
                                                    if (freshWaterPumpRelayState) {
                                                        relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                                                            if (mixingSolenoidRelayState) {
                                                                relayOnValueChecker(freshWaterSolenoidRelay, TURNOFF, function (freshWaterSolenoidRelay) {
                                                                    if (freshWaterSolenoidRelay) {
                                                                        CURRENT_STATE = recipeList.length == 0 ? N_STATE : FERTIGATE_STATE;
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    }
                                                });
                                            } else {
                                                console.log(`Tank Level - ${getCurrentLevel()} Fill Until ${targetLevel}`);
                                            }
                                        }, 100);
                                    }
                                });
                            }
                        });
                    }
                });
            } else {
                CURRENT_STATE = recipeList.length == 0 ? N_STATE : FERTIGATE_STATE;
            }
        }
    } else if (CURRENT_STATE == FERTIGATE_STATE) {
        CF.CurrentStateLog("FERTIGATE_STATE", stateTimer);
        if (!fertigateStateFlag) {
            fertigateStateFlag = true;
            if (AiGrowJson.majorVersion == MIXING_TYPE) {
                relayOnValueChecker(mixingSolenoidRelay, TURNON, function (mixingSolenoidRelayState) {
                    if (mixingSolenoidRelayState) {
                        relayOnValueChecker(mixingPumpRelay, TURNON, function (mixingPumpRelayState) {
                            if (mixingPumpRelayState) {
                                if (isMultiElementStateCompleted) {
                                    fertigationCycleData.startPH = PH_VALUE;
                                    CURRENT_STATE = PH_BALANCE_STATE;
                                } else {
                                    delay(8000).then(() => {
                                        if (CURRENT_STATE == FERTIGATE_STATE) {
                                            fertigationCycleData.startEC = EC_VALUE;
                                            CURRENT_STATE = MULTIELEMENT_STATE;
                                            fertigateStateFlag = false;
                                        }
                                    });
                                }
                            }
                        });
                    }
                });
            } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                relayOnValueChecker(mixingSolenoidRelay, TURNON, function (mixingSolenoidRelayState) {
                    if (mixingSolenoidRelayState) {
                        loopOutputValveEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                            if (relayFeedback) {
                                loopDrainPumpEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                                    if (relayFeedback) {
                                        if (isMultiElementStateCompleted) {
                                            fertigationCycleData.startPH = PH_VALUE;
                                            CURRENT_STATE = PH_BALANCE_STATE;
                                        } else {
                                            delay(5000).then(() => {
                                                if (CURRENT_STATE == FERTIGATE_STATE) {
                                                    fertigationCycleData.startEC = EC_VALUE;
                                                    CURRENT_STATE = MULTIELEMENT_STATE;
                                                    fertigateStateFlag = false;
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            }
        }
    } else if (CURRENT_STATE == MULTIELEMENT_STATE) {
        CF.CurrentStateLog("MULTIELEMENT_STATE", stateTimer);

        const recipeList = AiGrowJson.loopSchedules[currentLoopIndex].loopMultiRecipe.find((recipe) => recipe.id === currentRecipeId)?.recipe_list;
        if (recipeList?.some((dosingStep) => dosingStep.mode === "RATE")) {
            if (!dosingBusy && !rateModeDone) {
                const stepList = recipeList?.filter((dosingStep) => dosingStep.mode === "RATE");
                CF.LogCurrentRecipe(null, stepList);
                rateControlledDosing(stepList);
            }
        } else {
            rateModeDone = true;
        }

        if (recipeList?.some((dosingStep) => dosingStep.mode === "TIME")) {
            if (!dosingBusy && !timeModeDone) {
                const stepList = recipeList?.filter((dosingStep) => dosingStep.mode === "TIME");
                CF.LogCurrentRecipe(null, stepList);
                timeControlledDosing(stepList);
            }
        } else {
            timeModeDone = true;
        }

        if (recipeList?.some((dosingStep) => dosingStep.mode === "RATIO")) {
            if (!dosingBusy && !ratioModeDone) {
                const stepList = recipeList?.filter((dosingStep) => dosingStep.mode === "RATIO");
                const finalEC = Number(AiGrowJson.loopSchedules[currentLoopIndex].loopMultiRecipe.find((obj) => obj.id == currentRecipeId)?.final_ec);
                // Add targetEC to currentStep
                stepList.targetEC = targetEC;
                CF.LogCurrentRecipe(null, stepList);
                ratioControlledDosing(stepList, finalEC);
            }
        } else {
            ratioModeDone = true;
        }

        if (recipeList?.some((dosingStep) => dosingStep.mode === "EC")) {
            if (!dosingBusy && !ecModeDone) {
                const stepList = recipeList?.filter((dosingStep) => dosingStep.mode === "EC");
                const sortedStepList = stepList.sort((a, b) => a.step_number - b.step_number);
                ecControlledDosing(sortedStepList);
            }

            if ((EC_ERROR || ecValueStable5SecFlag) && AiGrowJson.minorVersion == VENTURI_TYPE) {
                venturiHandler.startECPHReading();
                ecValueStable5SecFlag = false;
                EC_ERROR = false;
                dosingBusy = false;
            }
        } else {
            ecModeDone = true;
        }

        let allCompleted = rateModeDone && timeModeDone && ratioModeDone && ecModeDone;
        if (allCompleted) {
            if (!dosingBusy && !isMultiElementStateCompleted) {
                isMultiElementStateCompleted = true;
                CF.LogCurrentRecipe(null, null);
                if (recipeList?.some((dosingStep) => ["TIME", "RATE"].includes(dosingStep.mode))) {
                    if (AiGrowJson.majorVersion == MIXING_TYPE) {
                        relayOnValueChecker(mixingPumpRelay, TURNOFF, function (mixingPumpRelayState) {
                            if (mixingPumpRelayState) {
                                relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                                    if (mixingSolenoidRelayState) {
                                        fertigationCycleData.endEC = EC_VALUE;
                                        CURRENT_STATE = WATER_BALANCE_STATE;
                                    }
                                });
                            }
                        });
                    } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                        loopDrainPumpEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                            if (relayFeedback) {
                                loopOutputValveEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                                    if (relayFeedback) {
                                        relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                                            if (mixingSolenoidRelayState) {
                                                fertigationCycleData.endEC = EC_VALUE;
                                                CURRENT_STATE = WATER_BALANCE_STATE;
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                } else {
                    fertigationCycleData.endEC = EC_VALUE;
                    CURRENT_STATE = PH_BALANCE_STATE;
                }
            }
        }
    } else if (CURRENT_STATE == WATER_BALANCE_STATE) {
        CF.CurrentStateLog("WATER_BALANCE_STATE", stateTimer);

        if (!waterBalanceState) {
            waterBalanceState = true;

            if (getCurrentLevel() < setTankLevel) {
                const fillWater = () => {
                    relayOnValueChecker(freshWaterSolenoidRelay, TURNON, function (freshWaterSolenoidRelayState) {
                        if (freshWaterSolenoidRelayState) {
                            relayOnValueChecker(mixingSolenoidRelay, TURNON, function (mixingSolenoidRelayState) {
                                if (mixingSolenoidRelayState) {
                                    relayOnValueChecker(freshWaterPumpRelay, TURNON, function (freshWaterPumpRelayState) {
                                        freshWaterPumpStatus = freshWaterPumpRelayState;
                                        if (freshWaterPumpRelayState) {
                                            const interval = setInterval(() => {
                                                if (CURRENT_STATE != WATER_BALANCE_STATE) {
                                                    sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                                    clearInterval(interval);
                                                    return;
                                                }
                                                if (getCurrentLevel() >= setTankLevel) {
                                                    sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                                    clearInterval(interval);
                                                    relayOnValueChecker(freshWaterPumpRelay, TURNOFF, function (freshWaterPumpRelayState) {
                                                        freshWaterPumpStatus = freshWaterPumpRelayState;
                                                        if (freshWaterPumpRelayState) {
                                                            relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                                                                if (mixingSolenoidRelayState) {
                                                                    relayOnValueChecker(freshWaterSolenoidRelay, TURNOFF, function (freshWaterSolenoidRelay) {
                                                                        if (freshWaterSolenoidRelay) {
                                                                            const recipeList = AiGrowJson.loopSchedules[currentLoopIndex].loopMultiRecipe.find((recipe) => recipe.id === currentRecipeId)?.recipe_list;
                                                                            if (recipeList?.some((dosingStep) => dosingStep.mode === "PH")) {
                                                                                CURRENT_STATE = PH_BALANCE_STATE;
                                                                            } else {
                                                                                CURRENT_STATE = N_STATE;
                                                                            }
                                                                            waterBalanceState = false;
                                                                        }
                                                                    });
                                                                }
                                                            });
                                                        }
                                                    });
                                                } else {
                                                    console.log(`Remaining Tank Level - ${getCurrentLevel()} Fill Until ${setTankLevel}..`);
                                                }
                                            }, 100);
                                        }
                                    });
                                }
                            });
                        }
                    });
                };

                if (AiGrowJson.majorVersion == MIXING_TYPE) {
                    sensorHandler.enableSensorCheck(mixingTankLevelSensorId);
                    fillWater();
                } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                    loopOutputValveEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                        if (relayFeedback) {
                            fillWater();
                        }
                    });
                }
            } else {
                const recipeList = AiGrowJson.loopSchedules[currentLoopIndex].loopMultiRecipe.find((recipe) => recipe.id === currentRecipeId)?.recipe_list;
                if (recipeList?.some((dosingStep) => dosingStep.mode === "PH")) {
                    CURRENT_STATE = PH_BALANCE_STATE;
                } else {
                    CURRENT_STATE = N_STATE;
                }
                waterBalanceState = false;
            }
        }
    } else if (CURRENT_STATE == PH_BALANCE_STATE) {
        CF.CurrentStateLog("PH_BALANCE_STATE", stateTimer);

        const recipeList = AiGrowJson.loopSchedules[currentLoopIndex].loopMultiRecipe.find((recipe) => recipe.id === currentRecipeId)?.recipe_list;
        if (recipeList?.some((dosingStep) => dosingStep.mode === "PH")) {
            if (!dosingBusy && !phModeDone) {
                const step = recipeList?.find((dosingStep) => dosingStep.mode === "PH");
                CF.LogCurrentRecipe(null, step);
                sensorHandler.enableSensorCheck(phSensorId);
                phControlledDosing(step);
            }

            if (phValueStable5SecFlag && AiGrowJson.minorVersion == VENTURI_TYPE) {
                venturiHandler.startECPHReading();
                phValueStable5SecFlag = false;
                dosingBusy = false;
                phModeDone = true;
            }
        } else {
            phModeDone = true;
        }

        if (phModeDone) {
            sensorHandler.disableSensorCheck(phSensorId);
            CF.LogCurrentRecipe(null, null);
            fertigationCycleData.endPH = PH_VALUE;
        }

        if (!dosingBusy && phModeDone && !phBalanceState) {
            phBalanceState = true;
            CF.LogCurrentRecipe(null, null);
            if (AiGrowJson.majorVersion == MIXING_TYPE) {
                relayOnValueChecker(mixingPumpRelay, TURNOFF, function (mixingPumpRelayState) {
                    if (mixingPumpRelayState) {
                        relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                            if (mixingSolenoidRelayState) {
                                CURRENT_STATE = N_STATE;
                            }
                        });
                    }
                });
            } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                loopDrainPumpEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                    if (relayFeedback) {
                        loopOutputValveEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                            if (relayFeedback) {
                                relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                                    if (mixingSolenoidRelayState) {
                                        CURRENT_STATE = N_STATE;
                                    }
                                });
                            }
                        });
                    }
                });
            }
        }
    } else if (CURRENT_STATE == N_STATE) {
        CF.CurrentStateLog("N_STATE", stateTimer);
        if (!nStateFlag) {
            nStateFlag = true;
            if (AiGrowJson.majorVersion == MIXING_TYPE) {
                sensorHandler.enableSensorCheck(mixingTankLevelSensorId);
                loopOutputValveEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                    if (relayFeedback) {
                        loopDrainPumpEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                            if (relayFeedback) {
                                const interval = setInterval(() => {
                                    if (CURRENT_STATE != N_STATE) {
                                        sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                        clearInterval(interval);
                                        return;
                                    }

                                    if (getCurrentLevel() <= mixingTankDrainLevel) {
                                        sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                        clearInterval(interval);
                                        loopDrainPumpEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                                            if (relayFeedback) {
                                                loopOutputValveEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                                                    if (relayFeedback) {
                                                        if (CURRENT_STATE == N_STATE) {
                                                            if (CURRENT_MODE == "FERTIGATE" || CURRENT_MODE == "FERTIGATEWITHDRAIN") {
                                                                CURRENT_STATE = CLEAN_SENSORS_STATE;
                                                            } else {
                                                                CURRENT_STATE = POST_FERTIGATE_STATE;
                                                            }
                                                        }
                                                    }
                                                });
                                            }
                                        });
                                    } else {
                                        console.log("MixingTankLevel - " + mixingTankLevel + " Flush Until " + mixingTankDrainLevel);
                                    }
                                }, 100);
                            }
                        });
                    }
                });
            } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                loopOutputValveEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                    if (relayFeedback) {
                        if (CURRENT_STATE == N_STATE) {
                            if (CURRENT_MODE == "FERTIGATE" || CURRENT_MODE == "FERTIGATEWITHDRAIN") {
                                CURRENT_STATE = CLEAN_SENSORS_STATE;
                            } else {
                                CURRENT_STATE = POST_FERTIGATE_STATE;
                            }
                        }
                    }
                });
            }
        }
    } else if (CURRENT_STATE == CLEAN_SENSORS_STATE) {
        CF.CurrentStateLog("CLEAN_SENSORS_STATE", stateTimer);

        if (!cleanSensorState) {
            cleanSensorState = true;
            if (AiGrowJson.majorVersion == MIXING_TYPE) {
                relayOnValueChecker(mixingSolenoidRelay, TURNON, function (mixingSolenoidRelayState) {
                    if (mixingSolenoidRelayState) {
                        relayOnValueChecker(freshWaterSolenoidRelay, TURNON, function (freshWaterSolenoidRelayState) {
                            if (freshWaterSolenoidRelayState) {
                                relayOnValueChecker(freshWaterPumpRelay, TURNON, function (freshWaterPumpRelayState) {
                                    if (freshWaterPumpRelayState) {
                                        delay(5000).then(() => {
                                            if (CURRENT_STATE == CLEAN_SENSORS_STATE) {
                                                CURRENT_STATE = CLEAN_SENSORS_WAIT_STATE;
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                relayOnValueChecker(mixingSolenoidRelay, TURNON, function (mixingSolenoidRelayState) {
                    if (mixingSolenoidRelayState) {
                        relayOnValueChecker(freshWaterSolenoidRelay, TURNON, function (freshWaterSolenoidRelayState) {
                            if (freshWaterSolenoidRelayState) {
                                loopOutputValveEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                                    if (relayFeedback) {
                                        relayOnValueChecker(freshWaterPumpRelay, TURNON, function (freshWaterPumpRelayState) {
                                            if (freshWaterPumpRelayState) {
                                                delay(5000).then(() => {
                                                    if (CURRENT_STATE == CLEAN_SENSORS_STATE) {
                                                        CURRENT_STATE = CLEAN_SENSORS_WAIT_STATE;
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        }
    } else if (CURRENT_STATE == CLEAN_SENSORS_WAIT_STATE) {
        CF.CurrentStateLog("CLEAN_SENSORS_WAIT_STATE", stateTimer);

        if (!cleanSensorWaitState) {
            cleanSensorWaitState = true;
            if (AiGrowJson.majorVersion == MIXING_TYPE) {
                relayOnValueChecker(freshWaterPumpRelay, TURNOFF, function (freshWaterPumpRelayState) {
                    if (freshWaterPumpRelayState) {
                        relayOnValueChecker(freshWaterSolenoidRelay, TURNOFF, function (freshWaterSolenoidRelayState) {
                            if (freshWaterSolenoidRelayState) {
                                relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                                    if (mixingSolenoidRelayState) {
                                        if (CURRENT_STATE == CLEAN_SENSORS_WAIT_STATE) {
                                            CURRENT_STATE = POST_FERTIGATE_STATE;
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                relayOnValueChecker(freshWaterPumpRelay, TURNOFF, function (freshWaterPumpRelayState) {
                    if (freshWaterPumpRelayState) {
                        loopOutputValveEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                            if (relayFeedback) {
                                relayOnValueChecker(freshWaterSolenoidRelay, TURNOFF, function (freshWaterSolenoidRelayState) {
                                    if (freshWaterSolenoidRelayState) {
                                        relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                                            if (mixingSolenoidRelayState) {
                                                if (CURRENT_STATE == CLEAN_SENSORS_WAIT_STATE) {
                                                    CURRENT_STATE = POST_FERTIGATE_STATE;
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        }
    } else if (CURRENT_STATE == POST_FERTIGATE_STATE) {
        CF.CurrentStateLog("POST_FERTIGATE_STATE", stateTimer);

        function postStage() {
            customRelaySettings.forEach((element) => {
                if ([2, 3].indexOf(element.mode) > -1) {
                    relayOnValueChecker(element, TURNOFF, function (relayFeedBack) {
                        CF.Log(`Mode: ${element.mode}, Node ID: ${element.currentNodeId}, Device ID: ${element.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedBack}`);
                    });
                }
            });
            let longestOnRelay = getLongestPostStageRelaySettings();
            CF.DebugLog(longestOnRelay);
            if (longestOnRelay != null) {
                customRelaySettings.forEach((element) => {
                    if ([4, 5, 6].indexOf(element.mode) > -1) {
                        if (element.postStageTime == longestOnRelay.postStageTime) {
                            relayOnValueChecker(element, TURNON, function (relayFeedBack) {
                                CF.Log(`Mode: ${element.mode}, Node ID: ${element.currentNodeId}, Device ID: ${element.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedBack}`);
                            });
                        }
                    }
                });
                secondsTimer(
                    longestOnRelay.postStageTime,
                    function () {
                        customRelaySettings.forEach((element) => {
                            if ([4, 5, 6].indexOf(element.mode) > -1) {
                                relayOnValueChecker(element, TURNOFF, function (relayFeedBack) {
                                    CF.Log(`Mode: ${element.mode}, Node ID: ${element.currentNodeId}, Device ID: ${element.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedBack}`);
                                });
                            }
                        });
                        delay(5000).then(() => {
                            fertigationEnd();
                        });
                    },
                    function (remainTime) {
                        customRelaySettings.forEach((element) => {
                            if ([4, 5, 6].indexOf(element.mode) > -1) {
                                if (element.postStageTime == remainTime) {
                                    relayOnValueChecker(element, TURNON, function (relayFeedBack) {
                                        CF.Log(`Mode: ${element.mode}, Node ID: ${element.currentNodeId}, Device ID: ${element.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedBack}`);
                                    });
                                }
                            }
                        });
                    }
                );
            } else {
                fertigationEnd();
            }
        }
        if (!postStageFlag) {
            postStageFlag = true;

            loopDrainPumpEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                if (relayFeedback) {
                    loopOutputValveEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                        if (relayFeedback) {
                            postStage();
                        }
                    });
                }
            });
        }
    } else if (CURRENT_STATE == ERROR_STATE) {
        CF.CurrentStateLog("ERROR_STATE", stateTimer);
        if (!safetyStopFlag) {
            safetyStopFlag = true;
            delay(8000).then(() => {
                safetyStopAll({});
            });
        }
    } else if (CURRENT_STATE == SAFETY_CHECK) {
        CF.CurrentStateLog("SAFETY_CHECK", stateTimer);
    } else if (CURRENT_STATE == DRAIN_TANK) {
        CF.CurrentStateLog("DRAIN_TANK", stateTimer);

        if (!drainTankFlag) {
            drainTankFlag = true;
            if (AiGrowJson.loopSchedules[currentLoopIndex].localTankWaterLevel > AiGrowJson.loopSchedules[currentLoopIndex].localTankDrainLevel) {
                relayOnValueChecker(drainSolenoidRelay, TURNON, function (drainSolenoidState) {
                    if (drainSolenoidState) {
                        loopDrainPumpEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                            if (relayFeedback) {
                                const interval = setInterval(() => {
                                    if (CURRENT_STATE != DRAIN_TANK) {
                                        clearInterval(interval);
                                        return;
                                    }

                                    if (AiGrowJson.loopSchedules[currentLoopIndex].localTankWaterLevel <= AiGrowJson.loopSchedules[currentLoopIndex].localTankDrainLevel) {
                                        clearInterval(interval);
                                        loopDrainPumpEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                                            if (relayFeedback) {
                                                relayOnValueChecker(drainSolenoidRelay, TURNOFF, function (drainSolenoidState) {
                                                    if (drainSolenoidState) {
                                                        if (CURRENT_STATE == DRAIN_TANK) {
                                                            if (CURRENT_MODE == "DRAIN") {
                                                                fertigationEnd();
                                                            } else {
                                                                CURRENT_STATE = PRE_FERTIGATE_STATE;
                                                            }
                                                        }
                                                    }
                                                });
                                            }
                                        });
                                    } else {
                                        console.log(`Loop Tank Level ${AiGrowJson.loopSchedules[currentLoopIndex].localTankWaterLevel} Drain Until ${AiGrowJson.loopSchedules[currentLoopIndex].localTankDrainLevel}`);
                                    }
                                }, 100);
                            }
                        });
                    }
                });
            } else {
                if (CURRENT_MODE == "DRAIN") {
                    fertigationEnd();
                } else {
                    CURRENT_STATE = PRE_FERTIGATE_STATE;
                }
            }
        }
    } else if (CURRENT_STATE == EMPTY_MIXING_TANK) {
        CF.CurrentStateLog("EMPTY_MIXING_TANK", stateTimer);
        if (!emptyMixingTankFlag) {
            emptyMixingTankFlag = true;
            if (getCurrentLevel() > mixingTankDrainLevel) {
                sensorHandler.enableSensorCheck(mixingTankLevelSensorId);
                relayOnValueChecker(drainSolenoidRelay, TURNON, function (drainSolenoidRelayState) {
                    if (drainSolenoidRelayState) {
                        relayOnValueChecker(mixingPumpRelay, TURNON, function (mixingPumpRelayState) {
                            if (mixingPumpRelayState) {
                                const interval = setInterval(() => {
                                    if (CURRENT_STATE != EMPTY_MIXING_TANK) {
                                        sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                        clearInterval(interval);
                                        return;
                                    }

                                    if (getCurrentLevel() <= mixingTankDrainLevel) {
                                        sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                        clearInterval(interval);
                                        relayOnValueChecker(mixingPumpRelay, TURNOFF, function (mixingPumpRelayState) {
                                            if (mixingPumpRelayState) {
                                                relayOnValueChecker(drainSolenoidRelay, TURNOFF, function (drainSolenoidRelayState) {
                                                    if (drainSolenoidRelayState) {
                                                        if (CURRENT_STATE == EMPTY_MIXING_TANK) {
                                                            if (CURRENT_MODE == "DRAIN") {
                                                                fertigationEnd();
                                                            } else {
                                                                CURRENT_STATE = PRE_FERTIGATE_STATE;
                                                            }
                                                        }
                                                    }
                                                });
                                            }
                                        });
                                    } else {
                                        console.log(`Mixing Tank Level ${getCurrentLevel()} Drain Until ${mixingTankDrainLevel}`);
                                    }
                                }, 500);
                            }
                        });
                    }
                });
            } else {
                if (CURRENT_MODE == "DRAIN") {
                    fertigationEnd();
                } else {
                    CURRENT_STATE = PRE_FERTIGATE_STATE;
                }
            }
        }
    } else if (CURRENT_STATE == EC_REDUCE_STATE) {
        CF.CurrentStateLog("EC_REDUCE_STATE", stateTimer);

        if (!ecReduceStateFlag) {
            ecReduceStateFlag = true;

            if (AiGrowJson.majorVersion == MIXING_TYPE) {
                sensorHandler.enableSensorCheck(mixingTankLevelSensorId);
                relayOnValueChecker(drainSolenoidRelay, TURNON, function (drainSolenoidRelayState) {
                    if (drainSolenoidRelayState) {
                        relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                            if (mixingSolenoidRelayState) {
                                relayOnValueChecker(mixingPumpRelay, TURNON, function (mixingPumpRelayState) {
                                    if (mixingPumpRelayState) {
                                        const interval = setInterval(() => {
                                            if (CURRENT_STATE != EC_REDUCE_STATE) {
                                                sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                                clearInterval(interval);
                                                return;
                                            }
                                            if (mixingTankLevel <= setTankLevel * EC_REDUCE_DRAIN_PERCENTAGE) {
                                                sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                                clearInterval(interval);
                                                relayOnValueChecker(mixingPumpRelay, TURNOFF, function (mixingPumpRelayState) {
                                                    if (mixingPumpRelayState) {
                                                        relayOnValueChecker(drainSolenoidRelay, TURNOFF, function (drainSolenoidRelayState) {
                                                            if (drainSolenoidRelayState) {
                                                                if (CURRENT_STATE == EC_REDUCE_STATE) {
                                                                    CURRENT_STATE = EC_FILL_WATER_STATE;
                                                                    ecReduceStateFlag = false;
                                                                }
                                                            }
                                                        });
                                                    }
                                                });
                                            } else {
                                                console.log(`Tank Drain Until ${setTankLevel * EC_REDUCE_DRAIN_PERCENTAGE}..`);
                                            }
                                        }, 100);
                                    }
                                });
                            }
                        });
                    }
                });
            } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                relayOnValueChecker(drainSolenoidRelay, TURNON, function (drainSolenoidState) {
                    if (drainSolenoidState) {
                        relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                            if (mixingSolenoidRelayState) {
                                loopOutputValveEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                                    if (relayFeedback) {
                                        loopDrainPumpEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                                            if (relayFeedback) {
                                                const interval = setInterval(() => {
                                                    if (CURRENT_STATE != EC_REDUCE_STATE) {
                                                        clearInterval(interval);
                                                        return;
                                                    }

                                                    if (AiGrowJson.loopSchedules[currentLoopIndex].localTankWaterLevel <= setTankLevel * EC_REDUCE_DRAIN_PERCENTAGE) {
                                                        clearInterval(interval);

                                                        loopDrainPumpEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                                                            if (relayFeedback) {
                                                                relayOnValueChecker(drainSolenoidRelay, TURNOFF, function (drainSolenoidState) {
                                                                    if (drainSolenoidState) {
                                                                        CURRENT_STATE = EC_FILL_WATER_STATE;
                                                                        ecReduceStateFlag = false;
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    } else {
                                                        console.log(`Loop Tank Level ${AiGrowJson.loopSchedules[currentLoopIndex].localTankWaterLevel} Drain Until ${setTankLevel * EC_REDUCE_DRAIN_PERCENTAGE}`);
                                                    }
                                                }, 100);
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        }
    } else if (CURRENT_STATE == EC_FILL_WATER_STATE) {
        CF.CurrentStateLog("EC_FILL_WATER_STATE", stateTimer);

        if (!ecFillWaterStateFlag) {
            ecFillWaterStateFlag = true;

            if (getCurrentLevel() < setTankLevel) {
                const fillWater = () => {
                    relayOnValueChecker(freshWaterSolenoidRelay, TURNON, function (freshWaterSolenoidRelayState) {
                        if (freshWaterSolenoidRelayState) {
                            relayOnValueChecker(mixingSolenoidRelay, TURNON, function (mixingSolenoidRelayState) {
                                if (mixingSolenoidRelayState) {
                                    relayOnValueChecker(freshWaterPumpRelay, TURNON, function (freshWaterPumpRelayState) {
                                        freshWaterPumpStatus = freshWaterPumpRelayState;
                                        if (freshWaterPumpRelayState) {
                                            const interval = setInterval(() => {
                                                if (CURRENT_STATE != EC_FILL_WATER_STATE) {
                                                    sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                                    clearInterval(interval);
                                                    return;
                                                }
                                                if (getCurrentLevel() >= setTankLevel) {
                                                    sensorHandler.disableSensorCheck(mixingTankLevelSensorId);
                                                    clearInterval(interval);
                                                    relayOnValueChecker(freshWaterPumpRelay, TURNOFF, function (freshWaterPumpRelayState) {
                                                        freshWaterPumpStatus = freshWaterPumpRelayState;
                                                        if (freshWaterPumpRelayState) {
                                                            relayOnValueChecker(mixingSolenoidRelay, TURNOFF, function (mixingSolenoidRelayState) {
                                                                if (mixingSolenoidRelayState) {
                                                                    relayOnValueChecker(freshWaterSolenoidRelay, TURNOFF, function (freshWaterSolenoidRelay) {
                                                                        if (freshWaterSolenoidRelay) {
                                                                            CURRENT_STATE = FERTIGATE_STATE;
                                                                            ecFillWaterStateFlag = false;
                                                                        }
                                                                    });
                                                                }
                                                            });
                                                        }
                                                    });
                                                } else {
                                                    console.log(`Filling water Until ${setTankLevel}..`);
                                                }
                                            }, 100);
                                        }
                                    });
                                }
                            });
                        }
                    });
                };

                if (AiGrowJson.majorVersion == MIXING_TYPE) {
                    sensorHandler.enableSensorCheck(mixingTankLevelSensorId);
                    fillWater();
                } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                    loopOutputValveEnable(currentLoopIndex, TURNON, function (relayFeedback) {
                        if (relayFeedback) {
                            fillWater();
                        }
                    });
                }
            } else {
                CURRENT_STATE = FERTIGATE_STATE;
                ecFillWaterStateFlag = false;
            }
        }
    }

    if (AiGrowJson) {
        CF.LoopDetails(AiGrowJson.loopSchedules);

        AiGrowJson.status[0].flowMeterLocalTankIN = currentLoopIndex ? AiGrowJson.loopSchedules[currentLoopIndex].loopInFlowMeterValue : 0;
        AiGrowJson.status[0].flowMeterLocalTankOUT = currentLoopIndex ? AiGrowJson.loopSchedules[currentLoopIndex].loopOutFlowMeterValue : 0;
        AiGrowJson.status[0].flowMeterFreshWater = 0;
        AiGrowJson.status[0].flowMeterMixingLoop = 0;
        AiGrowJson.status[0].flowMeterDrain = 0;
        AiGrowJson.status[0].localTankWaterLevel = currentLoopIndex ? AiGrowJson.loopSchedules[currentLoopIndex].localTankWaterLevel : 0;
        AiGrowJson.status[0].solenoidFreshWater = 0;
        AiGrowJson.status[0].solenoidMixingLoop = 0;
        AiGrowJson.status[0].solenoidLocalTankOUT = 0;
        AiGrowJson.status[0].solenoidDrainOUT = 0;
        AiGrowJson.status[0].pumpMixing = 0;
        AiGrowJson.status[0].pumpLocalTankDrain = 0;
        AiGrowJson.status[0].pumpDosingAcid = 0;
        AiGrowJson.status[0].pumpDosingBase = 0;
        AiGrowJson.status[0].pumpDosingA = 0;
        AiGrowJson.status[0].pumpDosingB = 0;
        AiGrowJson.status[0].mixingTankLevel = mixingTankLevel;

        AiGrowJson.status[0].startEC = fertigationCycleData?.startEC;
        AiGrowJson.status[0].startPH = fertigationCycleData?.startPH;

        AiGrowJson.status[0].EC_SET = targetEC;
        AiGrowJson.status[0].PH_SET = targetPH;
        AiGrowJson.status[0].dosingStep = dosingStep;
        AiGrowJson.status[0].mode = CURRENT_MODE;
        AiGrowJson.status[0].currentLoop = currentLoopIndex;

        AiGrowJson.status[0].pumpFreshWater = freshWaterPumpStatus;
        AiGrowJson.status[0].currentEC = EC_VALUE;
        AiGrowJson.status[0].currentPH = PH_VALUE;
        AiGrowJson.status[0].STATE = CURRENT_STATE;
        AiGrowJson.status[0].recipeId = currentRecipeId;

        AiGrowJson.state = CURRENT_STATE;

        AiGrowJson.loopSchedules.forEach((loop) => {
            if (loop.loopCurrentNodeID == AiGrowJson.current_node_id) {
                loop.loopOutDeviceValue = getRelayExternalValueByDeviceId(loop.loopOutDeviceID);
                loop.loopDrainPumpRelayValue = getRelayExternalValueByDeviceId(loop.loopDrainPumpRelayDeviceID);
            }
        });
    }

    // Alarm
    if (errorHandler.hasErrorsInLog()) {
        gpio.write(11, 0, (err) => {
            if (err) throw err;
        });
    } else {
        gpio.write(11, 1, (err) => {
            if (err) throw err;
        });
    }
}, REFRESH_RATE);

process.stdin.resume(); // so the program will not close instantly

function exitHandler(exitCode) {
    if (exitCode || exitCode !== 0) {
        safetyStopAll({ isExit: true });
    }
}

// do something when app is closing
process.on("exit", exitHandler);

// catches ctrl+c event
process.on("SIGINT", exitHandler);

// catches "kill pid" (for example: nodemon restart)
process.on("SIGUSR1", exitHandler);
process.on("SIGUSR2", exitHandler);

// catches uncaught exceptions
process.on("uncaughtException", exitHandler);

// Rate Mode
function rateControlledDosing(rateList) {
    rateModeDone = false;
    dosingBusy = true;

    rateList.forEach((step) => {
        const tank = AiGrowJson.dosingTanks.find((tank) => tank.tank_id == step.tank_id);

        step.timeout = Math.round((1000 * getCurrentLevel() * step.rate_value) / DOSING_PUMP_ML_PER_SECOND);
        step.isCompleted = false;

        if (!tank || step.timeout <= 0) {
            CF.Log("Rate Dosing step skipped.");
            step.isCompleted = true;
            return;
        }

        const device = {
            deviceId: tank.device_id,
            currentNodeId: tank.current_node_id,
        };

        relayOnValueChecker(device, TURNON, (relayFeedBack) => {
            CF.Log(`Mode: RATE, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedBack}`);
        });

        const interval = setTimeout(() => {
            relayOnValueChecker(device, TURNOFF, (relayFeedBack) => {
                CF.Log(`Mode: RATE, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedBack}`);
            });

            step.isCompleted = true;

            const index = dosingInterval.indexOf(interval);
            if (index > -1) dosingInterval.splice(index, 1);

            if (rateList.every((step) => step.isCompleted)) {
                rateModeDone = true;
                dosingBusy = false;
            }
        }, step.timeout);

        dosingInterval.push(interval);
    });

    // Edge case: If all steps are skipped
    if (rateList.every((step) => step.isCompleted)) {
        rateModeDone = true;
        dosingBusy = false;
    }
}

// Time Mode
function timeControlledDosing(timeSteps) {
    timeModeDone = false;
    dosingBusy = true;

    timeSteps.forEach((step) => {
        const tank = AiGrowJson.dosingTanks.find((tank) => tank.tank_id == step.tank_id);

        step.timeout = step.time_seconds * 1000;
        step.isCompleted = false;

        if (!tank || step.timeout <= 0) {
            CF.Log("Time Dosing step skipped.");
            step.isCompleted = true;
            return;
        }

        const device = {
            deviceId: tank.device_id,
            currentNodeId: tank.current_node_id,
        };

        relayOnValueChecker(device, TURNON, (relayFeedBack) => {
            CF.Log(`Mode: TIME, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedBack}`);
        });

        const interval = setTimeout(() => {
            relayOnValueChecker(device, TURNOFF, (relayFeedBack) => {
                CF.Log(`Mode: TIME, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedBack}`);
            });

            step.isCompleted = true;

            const index = dosingInterval.indexOf(interval);
            if (index > -1) dosingInterval.splice(index, 1);

            if (timeSteps.every((step) => step.isCompleted)) {
                timeModeDone = true;
                dosingBusy = false;
            }
        }, step.timeout);

        dosingInterval.push(interval);
    });

    // Edge case: If all steps are skipped
    if (timeSteps.every((step) => step.isCompleted)) {
        timeModeDone = true;
        dosingBusy = false;
    }
}

// Ratio Mode
function ratioControlledDosing(ratioSteps, setEC) {
    ratioModeDone = false;
    dosingBusy = true;
    targetEC = setEC;

    // Calculate the greatest common divisor (GCD) of two numbers
    function gcd(a, b) {
        if (b === 0) return a;
        return gcd(b, a % b);
    }

    // Simplify the ratios by dividing each ratio by the GCD of all ratios
    function simplifyRatios(ratios) {
        const gcdValue = ratios.reduce((acc, val) => gcd(acc, val));
        return ratios.map((ratio) => ratio / gcdValue);
    }

    sensorHandler.enableSensorCheck(ecSensorId);

    if (EC_VALUE < setEC) {
        let ecDifference = setEC - EC_VALUE;

        const ratios = ratioSteps.map((step) => step.ratio_value);
        const simplifiedRatios = simplifyRatios(ratios);
        const sumOfRatios = simplifiedRatios.reduce((acc, val) => acc + val, 0);

        const minEffectiveDifference = 1; // Minimum effective difference
        const adjustedDifference = Math.max(minEffectiveDifference, ecDifference) * 2; // Adjusted EC difference for scaling
        const currentMixingLevel = getCurrentLevel() / 100; // Current level percentage (0-1 range)
        const dynamicMixingFactor = 1 + Math.pow(currentMixingLevel, 2); // Amplifies mixing based on current level
        const dosingDuration = Math.round(adjustedDifference * dynamicMixingFactor * 2) * 1000; // Total dosing time based on adjustments

        ratioSteps.forEach((step, index) => {
            step.ratio = simplifiedRatios[index];
            step.timeout = (dosingDuration / sumOfRatios) * simplifiedRatios[index];
            step.isCompleted = false;
        });

        ratioSteps.forEach((step) => {
            const tank = AiGrowJson.dosingTanks.find((tank) => tank.tank_id == step.tank_id);

            if (!tank || step.timeout <= 0) {
                CF.Log("Ratio Dosing step skipped.");
                step.isCompleted = true;
                return;
            }

            const device = {
                deviceId: tank.device_id,
                currentNodeId: tank.current_node_id,
            };

            relayOnValueChecker(device, TURNON, (relayFeedBack) => {
                CF.Log(`Mode: RATIO, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedBack}`);
            });

            const interval = setTimeout(() => {
                relayOnValueChecker(device, TURNOFF, (relayFeedBack) => {
                    CF.Log(`Mode: RATIO, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedBack}`);
                });

                step.isCompleted = true;

                const index = dosingInterval.indexOf(interval);
                if (index > -1) dosingInterval.splice(index, 1);

                if (ratioSteps.every((step) => step.isCompleted)) {
                    const currentLevel = getCurrentLevel();
                    const delayTime = currentLevel < 100 ? REDUCED_DELAY_TIME : STANDARD_DELAY_TIME;

                    delay(delayTime).then(() => {
                        if (setEC - EC_VALUE < 0.5) {
                            delay(FINAL_CHECK_DELAY_TIME).then(() => (dosingBusy = false));
                        } else {
                            dosingBusy = false;
                        }
                    });
                }
            }, step.timeout);

            dosingInterval.push(interval);
        });
    } else if (EC_VALUE > setEC + EC_REDUCE_TOLERANCE) {
        if (ecReductionRound >= MAX_EC_REDUCTION_ROUNDS) {
            CF.LogCurrentRecipe(null, null);
            handleError(EC_LEVEL_EXCEED);
        } else {
            sensorHandler.disableSensorCheck(ecSensorId);
            ecReductionRound++;
            CURRENT_STATE = EC_REDUCE_STATE;
            dosingBusy = false;
        }
    } else {
        sensorHandler.disableSensorCheck(ecSensorId);
        CF.Log("Dosing completed, Target EC reached.");
        ratioModeDone = true;
        dosingBusy = false;
    }
}

// Ec
function ecControlledDosing(ecSteps) {
    ecModeDone = false;
    dosingBusy = true;
    dosingStep = dosingStep ?? 0;

    const currentStep = ecSteps[dosingStep];
    const stepECValue = Number(currentStep.ec_value);
    targetEC = Math.round((totalEC + stepECValue) * 100) / 100;
    // Add targetEC to currentStep
    currentStep.targetEC = targetEC;

    sensorHandler.enableSensorCheck(ecSensorId);
    CF.LogCurrentRecipe(dosingStep, currentStep);

    if (EC_VALUE < targetEC) {
        const tank = AiGrowJson.dosingTanks.find((tank) => tank.tank_id === currentStep.tank_id);
        if (!tank) {
            CF.Log("EC Dosing step skipped for Undefined Tank.");
            dosingStep++;
            dosingBusy = false;
            return;
        }

        if (AiGrowJson.minorVersion == VENTURI_TYPE) {
            venturiHandler.setVenturiEC(currentStep.tank_id, targetEC);
        } else if (AiGrowJson.minorVersion == DOSING_TYPE) {
            const ecDifference = targetEC - EC_VALUE;
            const minEffectiveDifference = 1; // Minimum effective difference
            const adjustedDifference = Math.max(minEffectiveDifference, ecDifference) * 2; // Adjusted EC difference for scaling
            const currentMixingLevel = getCurrentLevel() / 100; // Current level percentage (0-1 range)
            const dynamicMixingFactor = 1 + Math.pow(currentMixingLevel, 2); // Amplifies mixing based on current level
            const dosingDuration = Math.round(adjustedDifference * dynamicMixingFactor * 2) * 1000; // Total dosing time based on adjustments

            if (dosingDuration < 500) {
                CF.Log("EC Dosing step skipped.");
                dosingStep++;
                dosingBusy = false;
                return;
            }

            const device = {
                deviceId: tank.device_id,
                currentNodeId: tank.current_node_id,
            };

            relayOnValueChecker(device, TURNON, (relayFeedback) => {
                CF.Log(`EC Dosing ON: Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Feedback: ${relayFeedback}`);
            });

            const dosingTimeout = setTimeout(() => {
                relayOnValueChecker(device, TURNOFF, (relayFeedback) => {
                    CF.Log(`EC Dosing OFF: Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Feedback: ${relayFeedback}`);
                });

                const index = dosingInterval.indexOf(dosingTimeout);
                if (index > -1) dosingInterval.splice(index, 1);

                const currentLevel = getCurrentLevel();
                const delayTime = currentLevel < 100 ? REDUCED_DELAY_TIME : STANDARD_DELAY_TIME;

                delay(delayTime).then(() => {
                    if (targetEC - EC_VALUE < 0.5) {
                        delay(FINAL_CHECK_DELAY_TIME).then(() => (dosingBusy = false));
                    } else {
                        dosingBusy = false;
                    }
                });
            }, dosingDuration);

            dosingInterval.push(dosingTimeout);
        }
    } else if (EC_VALUE > targetEC + EC_REDUCE_TOLERANCE) {
        if (ecReductionRound >= MAX_EC_REDUCTION_ROUNDS) {
            CF.LogCurrentRecipe(null, null);
            handleError(EC_LEVEL_EXCEED);
        } else {
            sensorHandler.disableSensorCheck(ecSensorId);
            ecReductionRound++;
            CURRENT_STATE = EC_REDUCE_STATE;
            dosingBusy = false;
        }
    } else {
        CF.Log("EC Dosing step completed.");
        sensorHandler.disableSensorCheck(ecSensorId);
        totalEC += stepECValue;
        dosingStep++;
        if (dosingStep >= ecSteps.length) {
            ecModeDone = true;
        }
        dosingBusy = false;
    }
}

// PH
function phControlledDosing(step) {
    phModeDone = false;

    const maxPh = parseFloat(step.ph_high);
    const minPh = parseFloat(step.ph_low);
    const phRange = maxPh - minPh;

    // Calculate adjusted pH values
    const adjustedMaxPh = Math.round((maxPh - phRange / 4) * 100) / 100;
    const adjustedMinPh = Math.round((minPh + phRange / 4) * 100) / 100;

    targetPH = Math.round(((adjustedMaxPh + adjustedMinPh) * 100) / 2) / 100;

    if (AiGrowJson.minorVersion == VENTURI_TYPE) {
        if (PH_VALUE >= adjustedMinPh && PH_VALUE <= adjustedMaxPh) {
            phModeDone = true;
        } else {
            const acidTankId = AiGrowJson.dosingTanks.find((item) => item.chemical_mode == "ACID")?.tank_id;
            const baseTankId = AiGrowJson.dosingTanks.find((item) => item.chemical_mode == "BASE")?.tank_id;

            venturiHandler.setVenturiPH(acidTankId, baseTankId, minPh, maxPh);
        }
    } else if (AiGrowJson.minorVersion == DOSING_TYPE) {
        if (PH_VALUE > adjustedMaxPh) {
            dosingPumpAcid(TURNON, Math.round(PH_VALUE - adjustedMaxPh));
            dosingPumpBase(TURNOFF, 0);
        } else if (PH_VALUE < adjustedMinPh) {
            dosingPumpBase(TURNON, Math.round(adjustedMinPh - PH_VALUE));
            dosingPumpAcid(TURNOFF, 0);
        } else {
            phModeDone = true;
            dosingBusy = false;
        }
    }
}

function dosingPumpBase(value, different) {
    if (different < 5) different = 1;

    if (!dosingBusy) {
        dosingBusy = true;

        const tank = AiGrowJson.dosingTanks.find((item) => item.chemical_mode === "BASE");
        const device = {
            deviceId: tank.device_id,
            currentNodeId: tank.current_node_id,
        };

        if (value === TURNON) {
            relayOnValueChecker(device, TURNON, function (relayFeedback) {
                CF.Log(`Mode: BASE, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedback}`);
            });

            // Start the timer for dosing duration
            const dosingTime = different * PH_DOSING_DURATION_FACTOR;
            secondsTimer(
                dosingTime,
                function () {
                    dosingBusy = false;
                },
                function (remainingTime, interval) {
                    if (CURRENT_STATE != PH_BALANCE_STATE) {
                        clearInterval(interval);
                        return;
                    }
                    if (remainingTime < dosingTime / PH_TURNOFF_THRESHOLD_FACTOR) {
                        relayOnValueChecker(device, TURNOFF, function (relayFeedback) {
                            CF.Log(`Mode: BASE 1, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedback}`);
                        });
                    }
                }
            );
        } else {
            relayOnValueChecker(device, TURNOFF, function (relayFeedback) {
                CF.Log(`Mode: BASE 2, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedback}`);
            });
        }
    }
}

function dosingPumpAcid(value, different) {
    if (different < 5) different = 1;

    if (!dosingBusy) {
        dosingBusy = true;

        const tank = AiGrowJson.dosingTanks.find((item) => item.chemical_mode === "ACID");
        const device = {
            deviceId: tank.device_id,
            currentNodeId: tank.current_node_id,
        };

        if (value === TURNON) {
            relayOnValueChecker(device, TURNON, function (relayFeedback) {
                CF.Log(`Mode: ACID, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNON}, Feedback: ${relayFeedback}`);
            });

            // Start the timer for dosing duration
            const dosingTime = different * PH_DOSING_DURATION_FACTOR;
            secondsTimer(
                dosingTime,
                function () {
                    dosingBusy = false;
                },
                function (remainingTime, interval) {
                    if (CURRENT_STATE != PH_BALANCE_STATE) {
                        clearInterval(interval);
                        return;
                    }
                    if (remainingTime < dosingTime / PH_TURNOFF_THRESHOLD_FACTOR) {
                        relayOnValueChecker(device, TURNOFF, function (relayFeedback) {
                            CF.Log(`Mode: ACID 1, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedback}`);
                        });
                    }
                }
            );
        } else {
            relayOnValueChecker(device, TURNOFF, function (relayFeedback) {
                CF.Log(`Mode: ACID 2, Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Value: ${TURNOFF}, Feedback: ${relayFeedback}`);
            });
        }
    }
}

function handleError(errorCode, data = {}) {
    const logError = (message, errorDetails = {}) => {
        CF.ErrorLog(message);
        errorHandler.logError(AiGrowJson.current_node_id, CURRENT_STATE, stateTimer, errorCode, message, "N/A", false, errorDetails);
    };

    let message = "Unknown error occurred. Please contact AiGrow.";
    switch (errorCode) {
        case SENSOR_ERROR:
            message = `${data.sensor.userSensorText} sensor (${data.sensor.deviceID}) is reporting low variance. Fertigation will stop.`;
            logError(message, data);
            CURRENT_STATE = ERROR_STATE;
            break;

        case SERIAL_ERROR:
            message = "Not received serial data for over 30 seconds. Please contact AiGrow.";
            logError(message, data);
            safetyStopAll({ state: LOCK_STATE });
            break;

        case DEVICE_ERROR:
            let foundDevice;
            const deviceId = data.device?.deviceId;
            const currentNodeId = data.device?.currentNodeId;

            if (currentNodeId == AiGrowJson.current_node_id) {
                foundDevice = AiGrowJson.deviceArray.find((device) => device.deviceID == deviceId);
            } else {
                foundDevice = externalNodes
                    .find((externalNode) => externalNode.getId() == currentNodeId)
                    ?.getNode()
                    .deviceArray.find((device) => device.deviceID == deviceId);
            }

            if (foundDevice) {
                const action = data.value == TURNON ? "On" : "Off";
                const message = `Device ${foundDevice.userSensorText}(${foundDevice.deviceID}) can't power ${action}. Fertigation will stop.`;
                logError(message, { device: foundDevice });
            }
            break;

        case TANK_LEVEL_EXCEED:
            message = `The current tank level (${data.currentTankLevel} l) exceeds 90% of the set level (${data.setTankLevel} l). The cycle will automatically drain before starting fertigation.`;
            logError(message, data);
            break;

        case EC_LEVEL_EXCEED:
            message = `Fertigator cycle stopped after Maximum rounds of EC reduction reached. Please restart the cycle with drain.`;
            logError(message, data);
            safetyStopAll({});
            break;

        default:
            logError(message, data);
            break;
    }
}

function relayOnValueChecker(device, value, callback, currentState = CURRENT_STATE) {
    if (device.currentNodeId == 0 || device.deviceId == 0) {
        callback(true);
        return;
    }

    if (device.currentNodeId == AiGrowJson.current_node_id) {
        const relayIndex = getRelayIndex(device.deviceId);
        if (relayIndex > -1) {
            relaySwitchExternalWrapper(relayIndex, value);
            var count = 0;
            const interval = setInterval(() => {
                count++;
                if (value == TURNON) {
                    if (getRelayExternalValue(relayIndex) == 1) {
                        clearInterval(interval);
                        callback(true);
                    }
                } else {
                    if (getRelayExternalValue(relayIndex) == 0) {
                        clearInterval(interval);
                        callback(true);
                    }
                }

                if (count > 20 && CURRENT_STATE != SAFETY_CHECK) {
                    clearInterval(interval);
                    callback(false);

                    if (currentState == CURRENT_STATE) {
                        handleError(DEVICE_ERROR, { device, value });
                        CURRENT_STATE = ERROR_STATE;
                    }
                }
            }, 1000);
        } else {
            callback(false);
            CF.ErrorLog(`${device.deviceId} No device Found.`);
        }
    } else {
        const externalNode = externalNodes.find((node) => node.getId() == device.currentNodeId);
        if (externalNode) {
            externalNode.relaySwitchExternalWrapper(device.deviceId, value);
            var count = 0;
            const interval = setInterval(() => {
                count++;
                if (value == TURNON) {
                    if (externalNode.getDeviceValue(device.deviceId) == 1) {
                        clearInterval(interval);
                        callback(true);
                    }
                } else {
                    if (externalNode.getDeviceValue(device.deviceId) == 0) {
                        clearInterval(interval);
                        callback(true);
                    }
                }

                if (count > 40 && externalNode.isSerialActive() && CURRENT_STATE != SAFETY_CHECK) {
                    clearInterval(interval);
                    callback(false);

                    if (currentState == CURRENT_STATE) {
                        handleError(DEVICE_ERROR, { device, value });
                        CURRENT_STATE = ERROR_STATE;
                    }
                }
            }, 1000);
        } else {
            callback(false);
            CF.ErrorLog(`${device.deviceId} No device Found 2.`);
        }
    }
}

function getRelayIndex(deviceId) {
    return AiGrowJson.deviceArray.findIndex((item) => item.deviceID == Number(deviceId));
}

function getRelayExternalValue(relayNumber) {
    return AiGrowJson.deviceArray[relayNumber].sensorValue;
}

function relaySwitchExternalWrapper(relayNumber, value) {
    if (relayNumber >= 0 && relayNumber < 8) {
        const currentValue = relayDriver1.get().relayValueShadow[relayNumber];
        if (currentValue != value) {
            relayDriver1.relaySwitchExternal(relayNumber, value);
        }
    } else if (relayNumber >= 8 && relayNumber < 16) {
        const currentValue = relayDriver2.get().relayValueShadow[relayNumber - 8];
        if (currentValue != value) {
            relayDriver2.relaySwitchExternal(relayNumber - 8, value);
        }
    }
}

function relayTimerOnOffWrapper(relayNumber, value) {
    if (relayNumber >= 0 && relayNumber < 8) {
        relayDriver1.relayExternalTimerOnOff(relayNumber, value);
    } else if (relayNumber >= 8 && relayNumber < 16) {
        relayDriver2.relayExternalTimerOnOff(relayNumber - 8, value);
    }
}

function reset() {
    CF.LogCurrentRecipe(null, null);

    currentLoopIndex = null;
    dosingStep = null;
    CURRENT_MODE = null;
    currentRecipeId = null;
    setTankLevel = null;
    ecReductionRound = 0;
    fertigationCycleData = {};

    // dosing
    dosingInterval = [];
    dosingBusy = false;
    rateModeDone = false;
    timeModeDone = false;
    ratioModeDone = false;
    ecModeDone = false;
    phModeDone = false;
    totalEC = 0;
    targetEC = 0;
    targetPH = 0;

    //state flags
    preStageFlag = false;
    postStageFlag = false;
    emptyMixingTankFlag = false;
    fillWaterStateFlag = false;
    nStateFlag = false;
    fertigateStateFlag = false;
    isMultiElementStateCompleted = false;
    waterBalanceState = false;
    cleanSensorWaitState = false;
    cleanSensorState = false;
    ecReduceStateFlag = false;
    safetyStopFlag = false;
    ecFillWaterStateFlag = false;
    drainTankFlag = false;
    relayStateFlag = false;
    phBalanceState = false;
}

function getCurrentLevel() {
    if (AiGrowJson.majorVersion == MIXING_TYPE) {
        return mixingTankLevel;
    }

    if (AiGrowJson.majorVersion == LOOP_TYPE) {
        const { loopSchedules } = AiGrowJson;
        if (loopSchedules && loopSchedules[currentLoopIndex]) {
            return loopSchedules[currentLoopIndex].localTankWaterLevel;
        }
    }

    return 0;
}

setInterval(() => {
    if (CURRENT_STATE > POWER_ON_STATE) fileSave(AiGrowJson);
}, 5000);

function fileSave(data) {
    fileHandler.writeFile(FILE_INI, data, (err) => {
        if (err) CF.ErrorLog(err);
    });
}

function printInfo(json) {
    console.table([
        { Property: "Node Type", Value: "Fertigator Node" },
        { Property: "Node Id", Value: NODE_ID },
        { Property: "Current Node Id", Value: json.current_node_id },
        { Property: "Current Node Title", Value: json.node_title },
        { Property: "Greenhouse Name", Value: json.greenhouse_name },
    ]);
}

setInterval(function () {
    if (CURRENT_STATE > POWER_ON_STATE && AiGrowJson) {
        ValueBind();
    }
}, 200);

function ValueBind() {
    AiGrowJson.deviceArray.forEach((device, index) => {
        var tempIndex;
        let relayDriver;
        if (index < relayDriver1.get().relayEnableCount) {
            tempIndex = device.index;
            relayDriver = relayDriver1;
        } else {
            relayDriver = relayDriver2;
            tempIndex = device.index - relayDriver1.get().relayEnableCount;
        }
        AiGrowJson.deviceArray[index].sensorValue = 1 - relayDriver.get().relayExternalValue[tempIndex];
        AiGrowJson.deviceArray[index].additional_data = relayDriver.get().relayValueShadow[tempIndex] + "," + "0" + "," + relayDriver.get().relayOnByShadow[tempIndex] + "," + relayDriver.get().relayExternalValue[tempIndex];
        AiGrowJson.deviceArray[index].lastFetch = dateFormat(new Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT");
    });
}

function updateAiGrowJson(newData, existingData) {
    // Update MQTT if handler is available
    if (mqttHandler) {
        mqttHandler.updateMqtt(newData);
    }

    // Synchronize deviceArray values
    newData.deviceArray.forEach((newDevice, index) => {
        if (newDevice.userInvolveValue == "on" && newDevice.remoteEnable == 1) {
            relaySwitchExternalWrapper(index, TURNON);
        } else if (newDevice.userInvolveValue == "off" && newDevice.remoteEnable == 1) {
            relaySwitchExternalWrapper(index, TURNOFF);
        } else if (newDevice.userInvolveValue == "auto" && newDevice.remoteEnable == 1) {
            relaySwitchExternalWrapper(index, TURNOFF);
            relaySchedule.reschedule(newDevice);
        }
    });

    // Synchronize sensorArray values
    newData.sensorArray.forEach((newSensor) => {
        const sensor = existingData.sensorArray.find((item) => item.deviceID == Number(newSensor.deviceID));
        if (sensor) {
            newSensor.sensorValue = sensor.sensorValue;
        }
    });

    // Sync status
    newData.status[0] = existingData.status[0];

    // Synchronize loopSchedules values
    newData.loopSchedules.forEach((newLoop) => {
        const loop = existingData.loopSchedules.find((item) => item.loop_id == Number(newLoop.loop_id));
        if (loop) {
            newLoop.localTankWaterLevel = loop.localTankWaterLevel;
        }
    });

    // Update external nodes with data bus values
    newData.dataBus.forEach((busData) => {
        const node = externalNodes.find((item) => item.getId() == busData.current_node_id);
        if (node) {
            node.updateNode(busData);
        }
    });

    return newData;
}

function getLongestPreStageRelaySettings() {
    return customRelaySettings.filter((element) => [1, 2, 6].includes(element.mode)).reduce((max, element) => (max == null || element.preStageTime > max.preStageTime ? element : max), null);
}

function getLongestPostStageRelaySettings() {
    return customRelaySettings.filter((element) => [4, 5, 6].includes(element.mode)).reduce((max, element) => (max == null || element.postStageTime > max.postStageTime ? element : max), null);
}

function fertigationStart({ loopIndex, fertigationMode, recipeId = 0, triggeredBy, tankLevel }) {
    function initializeFertigationCycleData() {
        const loop = AiGrowJson.loopSchedules[currentLoopIndex];
        fertigationCycleData.start = dateFormat(new Date(), "yyyy/mm/dd HH:MM:ss TT");
        fertigationCycleData.startTankLevel = loop.localTankWaterLevel;
        fertigationCycleData.startEC = EC_VALUE;
        fertigationCycleData.startPH = PH_VALUE;
        fertigationCycleData.loopNumber = Number(loopIndex) + 1;
        fertigationCycleData.mode = fertigationMode;
        fertigationCycleData.triggerBy = triggeredBy;
        fertigationCycleData.recipe = loop.loopMultiRecipe.find((recipe) => recipe.id == currentRecipeId)?.recipe_list || [];
        fertigationCycleData.currentNodeId = AiGrowJson.current_node_id;

        if (AiGrowJson.majorVersion == MIXING_TYPE) {
            fertigationCycleData.startTankLevel = mixingTankLevel;
        }
    }

    function addToRemainingCycle() {
        const fertigationData = {
            loopIndex,
            fertigationMode,
            recipeId,
            triggeredBy,
            tankLevel,
        };
        remainingFertigationCycle.push(fertigationData);

        if (!addToRemainingCycle.interval) {
            addToRemainingCycle.interval = setInterval(() => {
                if (CURRENT_STATE == IDLE_STATE && remainingFertigationCycle.length > 0) {
                    fertigationStart(remainingFertigationCycle.shift());
                }

                if (remainingFertigationCycle.length == 0) {
                    clearInterval(addToRemainingCycle.interval);
                    addToRemainingCycle.interval = null;
                }
            }, 5000);
        }
    }

    if (CURRENT_STATE == IDLE_STATE) {
        CURRENT_MODE = fertigationMode;
        currentLoopIndex = loopIndex;
        currentRecipeId = Number(recipeId);
        setTankLevel = tankLevel ?? AiGrowJson.loopSchedules[currentLoopIndex].localTankSetLevel;

        // Initialize fertigation data
        initializeFertigationCycleData();

        // Set state based on mode
        if (fertigationMode === "FERTIGATE" || fertigationMode === "FRESHWATER") {
            // Check if the tank level exceeds 90% of the set level
            if (fertigationCycleData.startTankLevel > 0.9 * setTankLevel) {
                handleError(TANK_LEVEL_EXCEED, { currentTankLevel: fertigationCycleData.startTankLevel, setTankLevel: setTankLevel });
                if (AiGrowJson.majorVersion == MIXING_TYPE) {
                    CURRENT_STATE = EMPTY_MIXING_TANK;
                } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                    CURRENT_STATE = DRAIN_TANK;
                }
            } else {
                CURRENT_STATE = PRE_FERTIGATE_STATE;
            }
        } else if (["DRAIN", "FERTIGATEWITHDRAIN", "FRESHWATERWITHDRAIN"].includes(fertigationMode)) {
            if (AiGrowJson.majorVersion == MIXING_TYPE) {
                CURRENT_STATE = EMPTY_MIXING_TANK;
            } else if (AiGrowJson.majorVersion == LOOP_TYPE) {
                CURRENT_STATE = DRAIN_TANK;
            }
        }
    } else {
        // Add the cycle to remaining if not idle
        addToRemainingCycle();
    }
}

function fertigationEnd() {
    customRelaySettings.forEach((device) => {
        relayOnValueChecker(device, TURNOFF, (relayFeedback) => {
            CF.Log(`Fertigation End Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Feedback: ${relayFeedback}`);
        });
    });

    loopDrainPumpEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
        if (relayFeedback) {
            loopOutputValveEnable(currentLoopIndex, TURNOFF, function (relayFeedback) {
                if (relayFeedback) {
                    cycleEndAPICall(true);
                    reset();
                    CURRENT_STATE = IDLE_STATE;
                }
            });
        }
    });
}

function cycleEndAPICall(isComplete) {
    // Gather data for API call
    fertigationCycleData.endTankLevel = AiGrowJson.loopSchedules[currentLoopIndex].localTankWaterLevel;
    fertigationCycleData.endTime = dateFormat(new Date(), "yyyy/mm/dd HH:MM:ss TT");
    fertigationCycleData.isCompleted = isComplete;
    fertigationCycleData.endEC = fertigationCycleData.endEC ?? EC_VALUE;
    fertigationCycleData.endPH = fertigationCycleData.endPH ?? PH_VALUE;

    if (AiGrowJson.majorVersion == MIXING_TYPE) {
        fertigationCycleData.endTankLevel = mixingTankLevel;
    }

    // Call Fertigation Cycle End API
    apiService.fertigationCycleEnd(fertigationCycleData, function (response) {
        if (response.success) {
            apiService.getNodeINIAiGrow(function (response) {
                if (response && response.success) {
                    AiGrowJson = updateAiGrowJson(response, AiGrowJson);
                    fertigateSchedule();
                }
            });
        }
    });
}

function stopFertigation() {
    try {
        if (currentLoopIndex == null) return;

        remainingFertigationCycle = [];

        CURRENT_STATE = SAFETY_CHECK;

        dosingInterval.forEach(clearTimeout);
        sensorHandler.disableAllSensorChecks();

        venturiHandler.stopVenturi((success) => {
            CF.DebugLog(`Safety Stopped Venturi: ${success}`);
        });

        customRelaySettings.forEach((device) => {
            relayOnValueChecker(device, TURNOFF, (relayFeedback) => {
                CF.Log(`Safety Stopped Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Feedback: ${relayFeedback}`);
            });
        });

        const pumps = AiGrowJson.deviceArray.filter((device) => device.type.includes("Pump"));
        const others = AiGrowJson.deviceArray.filter((device) => !device.type.includes("Pump"));

        let allPumpsStopped = 0;
        let isCompleted = false;

        if (pumps.length > 0) {
            pumps.forEach((device) => {
                deviceOnValueChecker(device, TURNOFF, function (relayFeedback) {
                    if (relayFeedback) {
                        allPumpsStopped++;
                    }

                    if (allPumpsStopped == pumps.length) {
                        others.forEach((device) => {
                            deviceOnValueChecker(device, TURNOFF, function (relayFeedback) {
                                if (relayFeedback) {
                                    isCompleted = true;
                                }
                            });
                        });
                    }
                });
            });
        } else {
            // No pumps to process, directly turn off others
            others.forEach((device) => {
                deviceOnValueChecker(device, TURNOFF, function (relayFeedback) {
                    if (relayFeedback) {
                        isCompleted = true;
                    }
                });
            });
        }

        const safetyFlag = new Array(AiGrowJson.loopSchedules.length).fill(0);
        AiGrowJson.loopSchedules.forEach((loop, index) => {
            loopDrainPumpEnable(index, TURNOFF, function (relayFeedback) {
                if (relayFeedback) {
                    loopOutputValveEnable(index, TURNOFF, function (relayFeedback) {
                        if (relayFeedback) {
                            safetyFlag[index] = 1;
                        }
                    });
                }
            });
        });

        const interval = setInterval(() => {
            if (isCompleted && safetyFlag.every((flag) => flag == 1)) {
                clearInterval(interval);
                cycleEndAPICall(false);
                reset();
                CURRENT_STATE = IDLE_STATE;
            }
        }, 1000);
    } catch (error) {
        CF.ErrorLog("Stop Fertigation Error.", error);
        child_process.exec("node stop_relays", (execError) => {
            if (execError) {
                CF.ErrorLog("Error executing stop_relays script:", execError);
            }
        });
    }
}

function safetyStopAll({ isExit = false, action, state = IDLE_STATE }) {
    try {
        CURRENT_STATE = SAFETY_CHECK;

        dosingInterval.forEach(clearTimeout);
        sensorHandler.disableAllSensorChecks();

        venturiHandler.stopVenturi((success) => {
            CF.DebugLog(`Safety Stopped Venturi: ${success}`);
        });

        customRelaySettings.forEach((device) => {
            relayOnValueChecker(device, TURNOFF, (relayFeedback) => {
                CF.Log(`Safety Stopped Node ID: ${device.currentNodeId}, Device ID: ${device.deviceId}, Feedback: ${relayFeedback}`);
            });
        });

        const pumps = AiGrowJson.deviceArray.filter((device) => device.type.includes("Pump"));
        const others = AiGrowJson.deviceArray.filter((device) => !device.type.includes("Pump"));

        let allPumpsStopped = 0;
        let isCompleted = false;

        if (pumps.length > 0) {
            pumps.forEach((device) => {
                deviceOnValueChecker(device, TURNOFF, function (relayFeedback) {
                    if (relayFeedback) {
                        allPumpsStopped++;
                    }

                    if (allPumpsStopped == pumps.length) {
                        others.forEach((device) => {
                            deviceOnValueChecker(device, TURNOFF, function (relayFeedback) {
                                if (relayFeedback) {
                                    isCompleted = true;
                                }
                            });
                        });
                    }
                });
            });
        } else {
            // No pumps to process, directly turn off others
            others.forEach((device) => {
                deviceOnValueChecker(device, TURNOFF, function (relayFeedback) {
                    if (relayFeedback) {
                        isCompleted = true;
                    }
                });
            });
        }

        const safetyFlag = new Array(AiGrowJson.loopSchedules.length).fill(0);
        AiGrowJson.loopSchedules.forEach((loop, index) => {
            loopDrainPumpEnable(index, TURNOFF, function (relayFeedback) {
                if (relayFeedback) {
                    loopOutputValveEnable(index, TURNOFF, function (relayFeedback) {
                        if (relayFeedback) {
                            safetyFlag[index] = 1;
                        }
                    });
                }
            });
        });

        const interval = setInterval(() => {
            if (isCompleted && safetyFlag.every((flag) => flag == 1)) {
                clearInterval(interval);

                if (typeof action == "function") {
                    action();
                }

                if (isExit) {
                    process.exit();
                }

                reset();
                CURRENT_STATE = state;
                safetyStopFlag = false;
            }
        }, 1000);
    } catch (error) {
        CF.ErrorLog("Safety Stop Error.", error);
        child_process.exec("node stop_relays", (execError) => {
            if (execError) {
                CF.ErrorLog("Error executing stop_relays script:", execError);
            }
        });
    }
}

function deviceOnValueChecker(relay, value, callback) {
    if (relay == null) return callback(false);

    relayOnValueChecker(
        {
            deviceId: relay.deviceID,
            currentNodeId: relay.listenToCurrentNodeID,
        },
        value,
        callback
    );
}

function loopOutputValveEnable(loopIndex, value, callback) {
    if (loopIndex == null) return callback(false);

    const loopSchedule = AiGrowJson.loopSchedules[loopIndex];

    relayOnValueChecker(
        {
            deviceId: loopSchedule.loopOutDeviceID,
            currentNodeId: loopSchedule.loopCurrentNodeID,
        },
        value,
        callback
    );
}

function loopDrainPumpEnable(loopIndex, value, callback) {
    if (loopIndex == null) return callback(false);

    const loopSchedule = AiGrowJson.loopSchedules[loopIndex];

    relayOnValueChecker(
        {
            deviceId: loopSchedule.loopDrainPumpRelayDeviceID,
            currentNodeId: loopSchedule.loopCurrentNodeID,
        },
        value,
        callback
    );
}

function publishMqtt() {
    if (mqttHandler && AiGrowJson) {
        const mqttData = { ...AiGrowJson, dataBus: [], Mqtt: [] };
        mqttHandler.publish(mqttData);
    }
}

function levelSensorCalculate(value, capacityToHeight, sensorParameter, minLevel) {
    if (value < minLevel) value = minLevel; //min value
    let level = capacityToHeight * sensorParameter * (value - minLevel);
    if (level < 0) level = 0;
    return Math.round(level);
}

function getSensorValue(currentNode_id, deviceId) {
    if (currentNode_id == AiGrowJson.current_node_id) {
        const device = AiGrowJson.sensorArray.find((item) => item.deviceID == deviceId);
        return device ? device.sensorValue : 0;
    } else {
        const externalNode = ExternalNodes.find((element) => element.getId() == currentNode_id);
        if (externalNode) {
            const device = externalNode.getNode().sensorArray.find((item) => item.deviceID == deviceId);
            return device ? device.sensorValue : 0;
        }
    }

    return 0;
}

function secondsTimer(timeInSeconds, callback, remainTimer) {
    let remaining = timeInSeconds;
    const interval = setInterval(() => {
        remainTimer(remaining, interval);
        remaining--;

        if (remaining < 0) {
            clearInterval(interval);
            callback();
        }
    }, 1000);
}

function formatSensorData() {
    if (CURRENT_STATE <= POWER_ON_STATE) {
        return;
    }

    const fullDate = dateFormat(new Date(), "yyyy/mm/dd HH:MM:ss TT");
    let listOfInformation = {
        listOfInformation: [],
        node_type_id: AiGrowJson.node_type_id,
        current_node_id: AiGrowJson.current_node_id,
    };
    if (typeof AiGrowJson.sensorArray != "undefined") {
        AiGrowJson.sensorArray.forEach((element) => {
            if (element.enable == 1) {
                var pushData = {
                    device_id: element.deviceID,
                    value: element.sensorValue,
                    date: fullDate,
                    sent_by: AiGrowJson.current_node_id,
                    additional_data: "",
                    node_type_id: AiGrowJson.node_type_id,
                    dim_x: "0",
                    dim_y: "0",
                    dim_z: "0",
                };
                listOfInformation.listOfInformation.push(pushData);
            }
        });
    }
    if (typeof AiGrowJson.deviceArray != "undefined") {
        AiGrowJson.deviceArray.forEach((element) => {
            if (element.sensorValue == 1 || element.sensorValue == 0) {
                var pushData = {
                    device_id: element.deviceID,
                    value: element.sensorValue,
                    date: fullDate,
                    sent_by: AiGrowJson.current_node_id,
                    additional_data: element.additional_data,
                    node_type_id: AiGrowJson.node_type_id,
                    dim_x: "0",
                    dim_y: "0",
                    dim_z: "0",
                };
                listOfInformation.listOfInformation.push(pushData);
            }
        });
    }
    if (listOfInformation.listOfInformation.length > 0) {
        apiService.addDataRecordList(AiGrowJson, listOfInformation);
    }
}

function formatDeviceData(deviceId) {
    const fullDate = dateFormat(new Date(), "yyyy/mm/dd HH:MM:ss TT"); // Use `new Date()` directly for clarity
    const index = getRelayIndex(deviceId); // Get the index early for better organization
    const device = AiGrowJson.deviceArray[index]; // Cache the device data to avoid redundant lookups

    // Only process if sensorValue is 1 or 0
    if (device.sensorValue === 1 || device.sensorValue === 0) {
        const listOfInformation = {
            listOfInformation: [
                {
                    device_id: device.deviceID,
                    value: device.sensorValue,
                    date: fullDate,
                    sent_by: AiGrowJson.current_node_id,
                    additional_data: device.additional_data,
                    node_type_id: AiGrowJson.node_type_id,
                    dim_x: "0",
                    dim_y: "0",
                    dim_z: "0",
                },
            ],
            node_type_id: AiGrowJson.node_type_id,
            current_node_id: AiGrowJson.current_node_id,
        };

        // Call the API to add the data record
        apiService.addDataRecordList(AiGrowJson, listOfInformation);
    }
}

function systemReboot() {
    console.log("System Rebooting...");
    safetyStopAll({
        isExit: true,
        action: () => {
            child_process.exec("sudo /sbin/reboot", function (msg) {
                console.log(msg);
            });
        },
    });
}

function systemRestart() {
    console.log("System Restarting...");
    safetyStopAll({ isExit: true });
}

function fertigateSchedule() {
    AiGrowJson.loopSchedules.forEach((loop, loopIndex) => {
        let scheduleList = [];

        // Cancel existing fertigate schedules
        if (fertigateScheduleList[loopIndex]) {
            fertigateScheduleList[loopIndex].forEach((scheduleJob) => {
                scheduleJob.cancel();
            });
        }

        // Cancel existing drain schedules
        if (loopDrainScheduleList[loopIndex]) {
            loopDrainScheduleList[loopIndex].cancel();
        }

        // Set fertigate schedules
        loop.MultiRecipeSchedulelist.forEach((loopSchedule, scheduleIndex) => {
            if (!loopSchedule) return;

            // Get the CRON expression from the schedule list
            const cronExpression = loopSchedule.Schedule; // Schedule is the CRON expression
            const fertigationMode = loopSchedule.startWithDrain ? "FERTIGATEWITHDRAIN" : "FERTIGATE";

            // Create the schedule job
            scheduleList[scheduleIndex] = schedule.scheduleJob(cronExpression, () => {
                console.log(colors.black.bgGreen(`Fertigation triggered by schedule. Name: ${loopSchedule.ScheduleName} Mode: ${fertigationMode}, cron: ${cronExpression}`));
                fertigationStart({
                    loopIndex,
                    fertigationMode,
                    recipeId: loopSchedule.RecepeGroudId,
                    triggeredBy: "SCHEDULE",
                    tankLevel: loopSchedule.tankLevel,
                });
            });

            // Print the schedule details, including next invocation
            console.log(`LoopIndex: ${loopIndex}`);
            console.log(`  Schedule ${scheduleIndex}:`);
            console.log(`    CRON Expression: ${cronExpression}`);
            console.log(`    Next run at: ${scheduleList[scheduleIndex].nextInvocation()}`);
            console.log(`    Active: Yes`);
        });

        // Store the list of active fertigate schedules for this loop
        fertigateScheduleList[loopIndex] = scheduleList;

        // Set drain schedule (if any)
        if (loop.drainSchedule) {
            loopDrainScheduleList[loopIndex] = schedule.scheduleJob(loop.drainSchedule, () => {
                fertigationStart({
                    loopIndex,
                    fertigationMode: "DRAIN",
                    triggeredBy: "SCHEDULE",
                });
                console.log(colors.black.bgGreen(`Drain triggered by schedule.`));
            });
        }
    });
}

// UI functions
function handleFertigationCommand(jsonOut) {
    const loopIndex = parseInt(jsonOut.Loop) - 1;
    const tankSetValue = parseFloat(jsonOut.tankSetValue);
    const recipeId = parseFloat(jsonOut.recipeId);

    switch (jsonOut.Command) {
        case "FERTIGATE":
            fertigationStart({
                loopIndex: loopIndex,
                fertigationMode: "FERTIGATE",
                recipeId: recipeId,
                triggeredBy: "DISPLAY",
                tankLevel: tankSetValue,
            });
            break;
        case "FRESHWATER":
            fertigationStart({
                loopIndex: loopIndex,
                fertigationMode: "FRESHWATER",
                recipeId: recipeId,
                triggeredBy: "DISPLAY",
                tankLevel: tankSetValue,
            });
            break;
        case "DRAIN":
            fertigationStart({
                loopIndex: loopIndex,
                fertigationMode: "DRAIN",
                recipeId: recipeId,
                triggeredBy: "DISPLAY",
                tankLevel: tankSetValue,
            });
            break;
        case "FERTIGATEWITHDRAIN":
            fertigationStart({
                loopIndex: loopIndex,
                fertigationMode: "FERTIGATEWITHDRAIN",
                recipeId: recipeId,
                triggeredBy: "DISPLAY",
                tankLevel: tankSetValue,
            });
            break;
        case "FRESHWATERWITHDRAIN":
            fertigationStart({
                loopIndex: loopIndex,
                fertigationMode: "FRESHWATERWITHDRAIN",
                recipeId: recipeId,
                triggeredBy: "DISPLAY",
                tankLevel: tankSetValue,
            });
            break;
        case "STOP":
            stopFertigation();
            break;
        default:
            console.warn(`Unknown Command: ${jsonOut.Command}`);
            break;
    }
}

function handleUICommands(jsonOut) {
    switch (jsonOut.Command) {
        case "RESET":
            systemRestart();
            break;
        case "RESETANDRESUME":
            // TODO : Not implement
            break;
        case "REBOOT":
            systemReboot();
            break;
        default:
            console.warn(`Unknown Command: ${jsonOut.Command}`);
            break;
    }
}

function updateRecipe(recipe) {
    const currentDate = new Date();
    console.log(`Recipe Update Received for Loop ID - ${recipe.loopId} | Date - ${currentDate}`);

    recipe.token = AiGrowJson.token;
    const loopIndex = recipe.loopId - 1;
    const loopSchedule = AiGrowJson.loopSchedules[loopIndex];

    switch (recipe.Command) {
        case "ADD_RECIPE":
            loopSchedule.loopMultiRecipe.push(recipe.newRecipe);
            apiService.createMultiRecipe(recipe);
            break;

        case "DELETE_RECIPE":
            loopSchedule.loopMultiRecipe = loopSchedule.loopMultiRecipe.filter((existingRecipe) => existingRecipe.id !== recipe.recipeId);
            apiService.removeMultiRecipe(recipe);
            break;

        case "UPDATE_RECIPE_SCHEDULE":
            loopSchedule.MultiRecipeSchedulelist = recipe.scheduleList;
            fertigateSchedule();
            apiService.updateMultiRecipeSchedule(recipe);
            break;

        case "UPDATE_RECIPE_STEPS":
            const recipeToUpdate = loopSchedule.loopMultiRecipe.find((existingRecipe) => existingRecipe.id === recipe.recipeId);

            if (recipeToUpdate) {
                recipeToUpdate.recipe_list = recipe.recipeString.steps;
            } else {
                console.error(`Recipe with ID ${recipe.recipeId} not found in loop ${recipe.loopId}.`);
            }

            apiService.updateMultiRecipeSteps(recipe);
            break;

        default:
            console.error(`Invalid command: ${recipe.Command}`);
            break;
    }
}