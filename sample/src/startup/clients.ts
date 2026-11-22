import axios from 'axios';

export const jsonPlaceholder = 'https://jsonplaceholder.typicode.com';

/** An axios client: its calls go through XMLHttpRequest, captured by FloconNetwork like the ones of fetch. */
export const api = axios.create({ baseURL: jsonPlaceholder, timeout: 15000 });
