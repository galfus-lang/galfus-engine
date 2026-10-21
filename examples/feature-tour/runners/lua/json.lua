-- Compact Pure Lua JSON decoder/encoder for Galfus Feature Tour
local json = {}

local function kind_of(obj)
    if type(obj) ~= 'table' then return type(obj) end
    local i = 1
    for _ in pairs(obj) do
        if obj[i] ~= nil then i = i + 1 else return 'table' end
    end
    if i == 1 then return 'empty' else return 'array' end
end

local function escape_str(s)
    local in_char  = {'\\', '"', '/', '\b', '\f', '\n', '\r', '\t'}
    local out_char = {'\\', '"', '/',  'b',  'f',  'n',  'r',  't'}
    for i, c in ipairs(in_char) do
        s = s:gsub(c, '\\' .. out_char[i])
    end
    return s
end

function json.encode(val)
    local t = type(val)
    if t == 'nil' then
        return 'null'
    elseif t == 'boolean' or t == 'number' then
        return tostring(val)
    elseif t == 'string' then
        return '"' .. escape_str(val) .. '"'
    elseif t == 'table' then
        local kind = kind_of(val)
        if kind == 'array' or kind == 'empty' then
            local items = {}
            for i, v in ipairs(val) do
                table.insert(items, json.encode(v))
            end
            return '[' .. table.concat(items, ',') .. ']'
        else
            local items = {}
            for k, v in pairs(val) do
                table.insert(items, json.encode(tostring(k)) .. ':' .. json.encode(v))
            end
            return '{' .. table.concat(items, ',') .. '}'
        end
    else
        return 'null'
    end
end

function json.decode(str)
    local pos = 1
    local len = #str

    local function skip_whitespace()
        while pos <= len do
            local c = str:byte(pos)
            if c == 32 or c == 9 or c == 10 or c == 13 then
                pos = pos + 1
            else
                break
            end
        end
    end

    local parse_value

    local function parse_string()
        pos = pos + 1 -- skip opening quote
        local start = pos
        local chunks = {}
        while pos <= len do
            local c = str:byte(pos)
            if c == 34 then -- quote
                table.insert(chunks, str:sub(start, pos - 1))
                pos = pos + 1
                return table.concat(chunks)
            elseif c == 92 then -- backslash
                table.insert(chunks, str:sub(start, pos - 1))
                pos = pos + 1
                local esc = str:sub(pos, pos)
                if esc == '"' or esc == '\\' or esc == '/' then
                    table.insert(chunks, esc)
                elseif esc == 'b' then table.insert(chunks, '\b')
                elseif esc == 'f' then table.insert(chunks, '\f')
                elseif esc == 'n' then table.insert(chunks, '\n')
                elseif esc == 'r' then table.insert(chunks, '\r')
                elseif esc == 't' then table.insert(chunks, '\t')
                end
                pos = pos + 1
                start = pos
            else
                pos = pos + 1
            end
        end
        error("Unterminated string in JSON")
    end

    local function parse_number()
        local start = pos
        if str:byte(pos) == 45 then pos = pos + 1 end
        while pos <= len do
            local c = str:byte(pos)
            if (c >= 48 and c <= 57) or c == 46 or c == 101 or c == 69 or c == 43 or c == 45 then
                pos = pos + 1
            else
                break
            end
        end
        return tonumber(str:sub(start, pos - 1))
    end

    local function parse_array()
        pos = pos + 1 -- skip '['
        local arr = {}
        skip_whitespace()
        if pos <= len and str:byte(pos) == 93 then -- ']'
            pos = pos + 1
            return arr
        end
        while true do
            table.insert(arr, parse_value())
            skip_whitespace()
            local c = str:byte(pos)
            if c == 44 then -- ','
                pos = pos + 1
                skip_whitespace()
            elseif c == 93 then -- ']'
                pos = pos + 1
                break
            else
                error("Expected ',' or ']' inside JSON array at pos " .. pos)
            end
        end
        return arr
    end

    local function parse_object()
        pos = pos + 1 -- skip '{'
        local obj = {}
        skip_whitespace()
        if pos <= len and str:byte(pos) == 125 then -- '}'
            pos = pos + 1
            return obj
        end
        while true do
            skip_whitespace()
            if str:byte(pos) ~= 34 then
                error("Expected string key in JSON object at pos " .. pos)
            end
            local key = parse_string()
            skip_whitespace()
            if str:byte(pos) ~= 58 then -- ':'
                error("Expected ':' after key in JSON object at pos " .. pos)
            end
            pos = pos + 1
            obj[key] = parse_value()
            skip_whitespace()
            local c = str:byte(pos)
            if c == 44 then -- ','
                pos = pos + 1
                skip_whitespace()
            elseif c == 125 then -- '}'
                pos = pos + 1
                break
            else
                error("Expected ',' or '}' inside JSON object at pos " .. pos)
            end
        end
        return obj
    end

    parse_value = function()
        skip_whitespace()
        if pos > len then error("Unexpected end of JSON") end
        local c = str:byte(pos)
        if c == 34 then -- '"'
            return parse_string()
        elseif c == 123 then -- '{'
            return parse_object()
        elseif c == 91 then -- '['
            return parse_array()
        elseif (c >= 48 and c <= 57) or c == 45 then -- digit or '-'
            return parse_number()
        elseif str:sub(pos, pos + 3) == "true" then
            pos = pos + 4
            return true
        elseif str:sub(pos, pos + 4) == "false" then
            pos = pos + 5
            return false
        elseif str:sub(pos, pos + 3) == "null" then
            pos = pos + 4
            return nil
        else
            error("Unexpected character '" .. str:sub(pos, pos) .. "' at pos " .. pos)
        end
    end

    return parse_value()
end

return json
