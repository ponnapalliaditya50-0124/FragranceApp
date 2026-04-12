const { Logger } = require('../js/logger');

describe('Logger', () => {
    let consoleSpy;

    beforeEach(() => {
        consoleSpy = {
            debug: jest.spyOn(console, 'debug').mockImplementation(),
            info: jest.spyOn(console, 'info').mockImplementation(),
            warn: jest.spyOn(console, 'warn').mockImplementation(),
            error: jest.spyOn(console, 'error').mockImplementation(),
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('warn and error log at default level', () => {
        Logger.warn('test', 'warning message');
        Logger.error('test', 'error message');
        expect(consoleSpy.warn).toHaveBeenCalled();
        expect(consoleSpy.error).toHaveBeenCalled();
    });

    test('debug and info are suppressed at default level', () => {
        Logger.debug('test', 'debug message');
        Logger.info('test', 'info message');
        expect(consoleSpy.debug).not.toHaveBeenCalled();
        expect(consoleSpy.info).not.toHaveBeenCalled();
    });

    test('setLevel to debug enables all levels', () => {
        Logger.setLevel('debug');
        Logger.debug('test', 'visible');
        Logger.info('test', 'visible');
        expect(consoleSpy.debug).toHaveBeenCalled();
        expect(consoleSpy.info).toHaveBeenCalled();
        Logger.setLevel('warn'); // reset
    });

    test('setLevel to off suppresses everything', () => {
        Logger.setLevel('off');
        Logger.error('test', 'should not appear');
        expect(consoleSpy.error).not.toHaveBeenCalled();
        Logger.setLevel('warn'); // reset
    });

    test('formats messages with component prefix', () => {
        Logger.error('catalog', 'failed to load');
        expect(consoleSpy.error).toHaveBeenCalledWith('[catalog]', 'failed to load');
    });

    test('includes data parameter when provided', () => {
        Logger.error('api', 'request failed', { status: 500 });
        expect(consoleSpy.error).toHaveBeenCalledWith('[api]', 'request failed', { status: 500 });
    });
});
