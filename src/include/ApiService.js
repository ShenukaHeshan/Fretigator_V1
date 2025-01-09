import dateFormat from "dateformat";
import sha1 from "sha1";
import request from "request";
import colors from "colors";

const BASE_URL = "https://portal.aigrow.lk:12000/";

class AiGrowAPI {
    constructor(nodeId) {
        this.nodeId = nodeId;
    }

    getNodeINIAiGrow(onSuccess) {
        const url = `${BASE_URL}SmartSensController.asmx/GetNodeIni`;
        const token = sha1(this.nodeId.toString()).toUpperCase();
        const formData = { node_id: this.nodeId, token };

        sendRequest(formData, url, (response) => {
            if (response.success && response.node_id == this.nodeId) {
                onSuccess(response);
            } else {
                response.success = false;
                onSuccess(response)
            }
        });
    }

    fertigationCycleEnd(data, onSuccess) {
        const url = `${BASE_URL}SmartSensController.asmx/fertigationCycleEnd`;
        const token = sha1(data.currentNodeId.toString()).toUpperCase();
        const formData = {
            fertigation_id: data.currentNodeId.toString(),
            loop_number: data.loopNumber,
            start_time: data.start,
            end_time: data.endTime,
            start_tank_level: data.startTankLevel,
            end_tank_level: data.endTankLevel,
            start_ec: data.startEC,
            end_ec: data.endEC,
            start_ph: data.startPH,
            end_ph: data.endPH,
            mode: data.mode,
            is_completed: data.isCompleted,
            triger_by: data.triggerBy,
            recipe: JSON.stringify(data.recipe),
            token: token,
        };

        sendRequest(formData, url, onSuccess);
    }

    addDataRecordList(jsonData, records) {
        const url = `${BASE_URL}InformationController.asmx/addDataRecordList`;
        const currentDate = dateFormat(new Date(), "yyyy/mm/dd");
        const token = sha1(jsonData.greenhouse_id + currentDate).toUpperCase();

        const formData = {
            date: currentDate,
            greenhouseID: jsonData.greenhouse_id,
            currentNodeID: jsonData.current_node_id,
            nodeID: jsonData.node_id,
            token: token,
            recordList: JSON.stringify(records),
        };

        sendRequest(formData, url, () => { });
    }

    updateRecipe(currentNodeId, loopId, recipe) {
        const url = `${BASE_URL}FertigationController.asmx/setLoopDefaultRecipe`;
        const token = sha1(currentNodeId.toString()).toUpperCase();

        const formData = {
            fertigation_id: currentNodeId.toString(),
            loop_id: loopId,
            recipe_string: JSON.stringify(recipe),
            token: token,
        };

        sendRequest(formData, url, () => { });
    }

    updateSchedule(currentNodeId, loopId, schedule) {
        const url = `${BASE_URL}FertigationController.asmx/setFertigatorLoopSchedule`;
        const token = sha1(currentNodeId.toString()).toUpperCase();

        const formData = {
            fertigation_id: currentNodeId.toString(),
            loop_id: loopId,
            schedule_string: JSON.stringify(schedule),
            token: token,
        };

        sendRequest(formData, url, () => { });
    }

    logError(data, onSuccess) {
        const url = `${BASE_URL}ErrorLogController.asmx/InsertErrorLog`;
        const token = sha1(`${data.currentNodeId}${data.currentState}`).toUpperCase();

        const formData = {
            currentNodeId: data.currentNodeId,
            currentState: data.currentState,
            stateTimer: data.stateTimer,
            errorCode: data.errorCode,
            errorMessage: data.errorMessage,
            errorDescription: data.errorDescription,
            isSkipable: data.isSkipable,
            memoryUsage: JSON.stringify(data.memoryUsage),
            data: JSON.stringify(data.data),
            timeStamp: data.timestamp,
            token: token,
        };

        sendRequest(formData, url, (response) => {
            onSuccess(response && response.success);
        });
    }

    createMultiRecipe(data) {
        const url = `${BASE_URL}FertigationController.asmx/createMultiRecipe`;

        const formData = {
            recipeName: data.newRecipe.name,
            loopId: data.loopId,
            fertigationId: data.fertigationId,
            token: data.token,
        };

        sendRequest(formData, url, () => { });
    }

    removeMultiRecipe(data) {
        const url = `${BASE_URL}FertigationController.asmx/removeLoopMultiRecipe`;

        const formData = {
            recipeId: data.recipeId,
            loopId: data.loopId,
            fertigationId: data.fertigationId,
            token: data.token,
        };

        sendRequest(formData, url, () => { });
    }

    updateMultiRecipeSteps(data) {
        const url = `${BASE_URL}FertigationController.asmx/setMultiRecipeWithFinalEC`;

        const formData = {
            recipeId: data.recipeId,
            loopId: data.loopId,
            fertigationId: data.fertigationId,
            finalEC: data.final_ec,
            recipeString: JSON.stringify(data.recipeString),
            token: data.token,
        };

        sendRequest(formData, url, () => { });
    }

    updateMultiRecipeSchedule(data) {
        const url = `${BASE_URL}FertigationController.asmx/updateLoopMultiScheduleBulk`;

        const formData = {
            loopId: data.loopId,
            fertigationId: data.fertigationId,
            scheduleString: JSON.stringify(data.scheduleList),
            token: data.token,
        };

        sendRequest(formData, url, () => { });
    }
}

// Centralized function to send requests
function sendRequest(formData, url, callback) {
    console.log(colors.green(`Calling API: ${url}`));

    const options = {
        url: url,
        forever: true,
        form: formData,
        headers: {
            "User-Agent": "Super Agent/0.0.1",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
        timeout: 40000, // Timeout set to 40 seconds
    };

    request(options, (error, response, body) => {
        console.log(`API Response: ${url}`);
        const baseResponse = { success: false, error: null };

        if (error) {
            // Log network errors with date and time
            console.error(`API Error ${url}`, error);
            baseResponse.error = error.message || error;
            callback(baseResponse);
        } else if (response.statusCode === 200) {
            // Handle successful responses
            try {
                const data = JSON.parse(body);
                console.log(colors.green("Success:", data));
                callback(data);
            } catch (parseError) {
                // Log JSON parsing errors
                console.error(`API Parsing error ${url}`, parseError);
                baseResponse.error = "Parsing error";
                callback(baseResponse);
            }
        } else {
            // Log non-200 responses
            console.error(`Error Response URL : ${url} (${response.statusCode}) : `, body);
            baseResponse.error = body;
            callback(baseResponse);
        }
    });
}

export default AiGrowAPI;
