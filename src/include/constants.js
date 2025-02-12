import config from "../../config/config-default.js";

// Assign NODE_ID
global.NODE_ID = config.nodeId;

// Assign Device Ids
global.mixingPumpRelay = config.devices.mixingPumpRelay;
global.mixingSolenoidRelay = config.devices.mixingSolenoidRelay;
global.freshWaterPumpRelay = config.devices.freshWaterPumpRelay;
global.freshWaterSolenoidRelay = config.devices.freshWaterSolenoidRelay;
global.drainSolenoidRelay = config.devices.drainSolenoidRelay;
global.manifoldSolenoidRelay = config.devices.manifoldSolenoidRelay;

// Assign Sensor Ids
global.mixingFlowMeterSensorId = config.sensors.mixingFlowMeterSensorId;
global.mixingTankLevelSensorId = config.sensors.mixingTankLevelSensorId;
global.freshwaterTankLevelSensorId = config.sensors.freshwaterTankLevelSensorId;
global.ecSensorId = config.sensors.ecSensorId;
global.phSensorId = config.sensors.phSensorId;

// Assign Sensor Configuration
global.SENSOR_CONFIG = config.sensorConfig;

// 1 pre
// 2 pre + fertigate
// 3 fertigate
// 4 fertigate + post
// 5 post
// 6 pre + fertigate + post
global.customRelaySettings = config.customRelaySettings;

global.stateTimer = 0;
global.AiGrowJson = null;
global.EC_VALUE = 0;
global.PH_VALUE = 0;
global.ecMv = 0;
global.phMv = 0;
global.targetEC = 0;
global.targetPH = 0;
global.EC_ERROR = false;
global.freshWaterPumpStatus = 0;
global.mixingTankDrainLevel = 10;

// Constants
global.TURNON = 0;
global.TURNOFF = 1;
global.REFRESH_RATE = 100;
global.FILE_INI = "/home/pi/AiGrow-Device/ini/fertigator.ini";

// States
global.DEFAULT_STATE = 0;
global.CURRENT_STATE = 0;
global.PREVIOUS_STATE = 0;
global.POWER_ON_STATE = 1;
global.IDLE_STATE = 2;
global.RELAY_STATE = 3;
global.FILL_WATER_STATE = 6;
global.FERTIGATE_STATE = 7;
global.N_STATE = 10;
global.SAFETY_CHECK = 11;
global.EMPTY_MIXING_TANK = 12;
global.DRAIN_TANK = 14;
global.INLINE_STATE = 16;
global.FRESHWATER_STATE = 17;
global.ERROR_STATE = 21;
global.LOCK_STATE = 44;
global.FILL_WAIT_STATE = 46;
global.MULTIELEMENT_STATE = 47;
global.CLEAN_SENSORS_STATE = 37;
global.CLEAN_SENSORS_WAIT_STATE = 38;
global.PRE_FERTIGATE_STATE = 58;
global.POST_FERTIGATE_STATE = 59;
global.EC_REDUCE_STATE = 61;
global.EC_FILL_WATER_STATE = 62;
global.WATER_BALANCE_STATE = 63;
global.PH_BALANCE_STATE = 64;

// Error codes
global.SERIAL_ERROR = 3006;
global.SENSOR_ERROR = 3007;
global.DEVICE_ERROR = 3008;
global.DEVICE_CANT_FIND = 3009;
global.TANK_LEVEL_EXCEED = 3010;
global.EC_LEVEL_EXCEED = 3011;

// EC
global.EC_REDUCE_TOLERANCE = config.other.ecReduceTolerance;
global.MAX_EC_REDUCTION_ROUNDS = config.other.maxEcReductionRounds;
global.EC_REDUCE_DRAIN_PERCENTAGE = config.other.ecReduceDrainPercentage;
global.DOSING_PUMP_ML_PER_SECOND = config.other.dosingPumpMlPerSecond;
global.REDUCED_DELAY_TIME = config.other.reducedDelayTime;
global.STANDARD_DELAY_TIME = config.other.standardDelayTime;
global.FINAL_CHECK_DELAY_TIME = config.other.finalCheckDelayTime; 

// PH
global.PH_DOSING_DURATION_FACTOR = config.other.phDosingDurationFactor;
global.PH_TURNOFF_THRESHOLD_FACTOR = config.other.phTurnOffThresholdFactor;

// Other
global.IS_SENSOR_HANDLER_ENABLED = config.other.isSensorHandlerEnabled;

// Types
global.VENTURI_TYPE = "venturi";
global.DOSING_TYPE = "dosing";
global.LOOP_TYPE = "loopTank";
global.MIXING_TYPE = "mixingTank"; // mixingTank

// Relay Controller
global.ALLOFF = 0xff;
global.ALLON = 0;
global.TURNON = 0;
global.TURNOFF = 1;
global.BOOT_RELAY_VALUE = 255;
global.relayTimerCancel = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
global.relayLock = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
global.I2C_Busy = 0;

// WebSocket
global.PORT = 3001;
