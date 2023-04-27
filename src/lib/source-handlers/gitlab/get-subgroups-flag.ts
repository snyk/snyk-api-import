export function getSubGroupFlag(): boolean {
    let token = process.env.EXCLUDE_GITLAB_SUBGROUPS;
    if (token === undefined) {
        return false;
    }
    else {
        token = token.toUpperCase()
    } 
    if (token === "TRUE") {
        return true;
    }
    return false;
}