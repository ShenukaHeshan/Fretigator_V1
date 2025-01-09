const config = {
  nodeId: 146,

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
};

export default config;