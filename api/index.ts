import {handleRequest} from '../server/handler';

// Vercel's Web Standard function entry point handles both GET and POST here.
export default {fetch: handleRequest};
