//Import the necessary libraries
import { browser } from 'webextension-polyfill';
import { FormData} from 'fetch';

//Get the access token from the background script.
const accessToken = browser.storage.local.get('accessToken');

//Create a function to handle login request.
async function handleLogin(event){
    //Get the username and password from the form.
    const username = event.detail.username;
    const password = event.detail.password;

    //Make a request to the API to authenticate the user
    const response = await fetch('https://cloud.astian.org/auth/login', {
        method: 'POST' ,
        headers: {
            'Authorization': `Bearer ${accessToken}`
        },
        
    })
}