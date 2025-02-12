const config = {
  nodeId: 146, // Kegalle Upper fertogator

  devices: {
    mixingPumpRelay: { deviceId: 31084, currentNodeId: 119 },
    mixingSolenoidRelay: { deviceId: 31083, currentNodeId: 119 },
    freshWaterPumpRelay: { deviceId: 31082, currentNodeId: 119 },
    freshWaterSolenoidRelay: { deviceId: 0, currentNodeId: 0 },
    drainSolenoidRelay: { deviceId: 31085, currentNodeId: 119 },
    manifoldSolenoidRelay: { deviceId: 0, currentNodeId: 0 },
  },

  sensors: {
    mixingFlowMeterSensorId: 0,
    mixingTankLevelSensorId: 31096,
    freshwaterTankLevelSensorId: 0,
    ecSensorId: 31140,
    phSensorId: 31141,
  },

  sensorConfig: {
    31: {
      // level sensor
      maxHistoryLength: 30,
      minVariance: 5,
    },
    11: {
      // ec sensor
      maxHistoryLength: 30,
      minVariance: 0.00005,
    },
    12: {
      // ph sensor
      maxHistoryLength: 30,
      minVariance: 0.0005,
    },
    6: {
      // temperature sensor
      maxHistoryLength: 30,
      minVariance: 0,
    },
  },

  customRelaySettings: [
    // {
    //     deviceId: 29939,
    //     mode: 1,
    //     preStageTime: 5,
    //     postStageTime: 10,
    //     currentNodeId:48
    // },
  ],

  other: {
    // EC
    ecReduceTolerance: 0.3, // Tolerance limit for switching to "EC reduce" state
    maxEcReductionRounds: 3, // maximum number of rounds allowed for EC reduce.
    ecReduceDrainPercentage: 0.9, // Percentage of water to be drained for EC reduce.
    dosingPumpMlPerSecond: 8, // Flow rate in milliliters per second in dosing Pump - using rate mode
    reducedDelayTime: 8000, // Delay time in milliseconds when current level is less than 100
    standardDelayTime: 4000, // Standard delay time in milliseconds when current level is 100 or more
    finalCheckDelayTime: 5000, // Final check delay time in milliseconds to confirm dosing stability

    // PH
    phDosingDurationFactor: 10, // PH dosing duration factor
    phTurnOffThresholdFactor: 1, // PH turn off threshold factor

    // Other
    isSensorHandlerEnabled: false, // Enable sensor handler
  },
};

export default config;
