/* React 18 и htm подключены как обычные скрипты из /vendor (без сборщика). */
const React = window.React;
export const { useState, useEffect, useMemo, useRef, useCallback, useContext, createContext, Fragment } = React;
export const html = window.htm.bind(React.createElement);
export default React;
