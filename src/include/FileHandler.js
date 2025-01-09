import jsonfile from 'jsonfile';

export function readFile(filePath, onSuccess, onError) {
    try {
        const fileContent = jsonfile.readFileSync(filePath);

        // Check if fileContent is null or empty
        if (!fileContent || Object.keys(fileContent).length === 0) {
            const error = new Error("File is empty or content is null");
            return onError(error);
        }

        onSuccess(fileContent);
    } catch (error) {
        // Call onError with both null and the error
        onError(error);
    }
}

export function writeFile(filePath, data, callback) {
    jsonfile.writeFile(filePath, data, (error) => {
        if (error) {
            callback(error);
        }
    });
}